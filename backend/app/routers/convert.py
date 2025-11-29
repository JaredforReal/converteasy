"""
转换路由
"""
import os
import asyncio
import aiohttp
import aiofiles
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from nanoid import generate as nanoid

from app.config import settings, SUPPORTED_CONVERSIONS
from app.models import (
    Category, TaskState, ConvertTask,
    UploadResponse, TaskStatusResponse, DetectTargetsResponse
)
from app.utils.task_manager import task_manager
from app.utils.file_utils import (
    detect_ext_by_name, is_allowed_ext, is_conversion_supported,
    get_supported_targets, format_file_size, build_public_url,
    build_download_url, build_preview_url
)
from app.utils.converter import run_ffmpeg, run_document_conversion


router = APIRouter()
general_router = APIRouter()

# 并发限制信号量
convert_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT)


@general_router.get("/supported-formats")
async def get_supported_formats(category: Optional[str] = None):
    """获取支持的格式"""
    if category and category not in ["document", "audio"]:
        raise HTTPException(status_code=400, detail="不支持的分类")
    
    response = {}
    
    if not category or category == "document":
        response["document"] = {
            "allowedExtensions": settings.ALLOWED_DOC_EXT,
            "supportedConversions": SUPPORTED_CONVERSIONS["document"]
        }
    
    if not category or category == "audio":
        response["audio"] = {
            "allowedExtensions": settings.ALLOWED_AUDIO_EXT,
            "supportedConversions": SUPPORTED_CONVERSIONS["audio"]
        }
    
    return response


@general_router.post("/detect-targets")
async def detect_targets(
    file: UploadFile = File(...),
    category: str = Form(...)
):
    """检测文件支持的转换目标格式"""
    if category not in ["document", "audio"]:
        raise HTTPException(status_code=400, detail="不支持的分类")
    
    source_ext = detect_ext_by_name(file.filename or "")
    supported_targets = get_supported_targets(category, source_ext)
    
    return DetectTargetsResponse(
        filename=file.filename or "",
        category=Category(category),
        sourceExtension=source_ext,
        supportedTargets=supported_targets,
        canConvert=len(supported_targets) > 0
    )


@router.post("/upload", response_model=UploadResponse)
async def upload_and_convert(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    category: str = Form(...),
    target: str = Form(...),
    source: Optional[str] = Form(None),
    downloadUrl: Optional[str] = Form(None),
    cloudPath: Optional[str] = Form(None)
):
    """上传文件并开始转换"""
    # 处理目标格式
    target = target.lower().lstrip(".")
    
    # 处理文件来源
    input_path = None
    original_filename = None
    
    if file and file.filename:
        # 直接上传的文件
        file_id = nanoid()
        ext = detect_ext_by_name(file.filename)
        filename = f"{file_id}{ext}"
        input_path = Path(settings.UPLOAD_DIR) / filename
        original_filename = Path(file.filename).stem
        
        # 保存文件
        async with aiofiles.open(input_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
    elif downloadUrl:
        # 从 URL 下载文件
        try:
            ext = detect_ext_by_name(downloadUrl.split('?')[0])
            file_id = nanoid()
            filename = f"{file_id}{ext}"
            input_path = Path(settings.UPLOAD_DIR) / filename
            original_filename = cloudPath and Path(cloudPath).stem or file_id
            
            async with aiohttp.ClientSession() as session:
                async with session.get(downloadUrl) as resp:
                    if resp.status >= 400:
                        raise HTTPException(status_code=500, detail="下载远程文件失败")
                    
                    async with aiofiles.open(input_path, 'wb') as f:
                        async for chunk in resp.content.iter_chunked(8192):
                            await f.write(chunk)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"下载远程文件失败: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="缺少文件")
    
    # 验证分类和文件类型
    if category not in ["document", "audio"]:
        if input_path and input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail="不支持的分类")
    
    actual_ext = detect_ext_by_name(str(input_path))
    actual_source = actual_ext.replace(".", "")
    
    # 验证前端传递的源格式
    if source and source.lower() != actual_source:
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(
            status_code=400, 
            detail=f"文件格式不匹配：选择的是 {source.upper()} 格式，但上传的是 {actual_source.upper()} 文件"
        )
    
    # 验证扩展名
    if not is_allowed_ext(category, actual_ext):
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail="文件类型不被允许")
    
    # 验证转换是否支持
    if not is_conversion_supported(category, actual_ext, target):
        if input_path.exists():
            input_path.unlink()
        supported = get_supported_targets(category, actual_ext)
        raise HTTPException(
            status_code=400, 
            detail=f"不支持从 {actual_ext} 转换为 {target}",
            headers={"X-Supported-Targets": ",".join(supported)}
        )
    
    # 创建任务
    task_id = nanoid()
    task = ConvertTask(
        id=task_id,
        state=TaskState.QUEUED,
        category=Category(category),
        target=target,
        source=actual_source,
        input_path=str(input_path),
        original_filename=original_filename
    )
    task_manager.create_task(task)
    
    print(f"📝 任务创建: {task_id}, 文件: {original_filename}, 格式: {actual_source} -> {target}")
    
    # 后台执行转换
    background_tasks.add_task(convert_async, task)
    
    return UploadResponse(
        taskId=task_id,
        message="任务已提交，正在处理中"
    )


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """查询任务状态"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    print(f"🔍 查询任务状态: {task_id}, 状态: {task.state.value}, URL: {task.url}")
    
    return TaskStatusResponse(
        state=task.state,
        url=task.url,
        downloadUrl=task.download_url,
        previewUrl=task.preview_url,
        message=task.error
    )


async def convert_async(task: ConvertTask) -> None:
    """异步执行转换"""
    async with convert_semaphore:
        task.state = TaskState.PROCESSING
        task.updated_at = datetime.now()
        task_manager.update_task(task)
        
        try:
            # 生成友好文件名
            now = datetime.now()
            timestamp = now.strftime("%y%m%d%H%M")
            
            original_name = task.original_filename or f"document_{task.id[:6]}"
            # 清理文件名中的特殊字符
            import re
            clean_name = re.sub(r'[^\w\u4e00-\u9fa5\s]', '_', original_name)
            clean_name = re.sub(r'\s+', '_', clean_name)
            friendly_name = f"{clean_name}_{timestamp}"
            
            print(f"📝 生成文件名: 原始='{original_name}', 最终='{friendly_name}'")
            
            output_path = Path(settings.PUBLIC_DIR) / f"{friendly_name}.{task.target}"
            
            if task.category == Category.AUDIO:
                # 音频转换
                print(f"🎵 开始音频转换: {task.input_path} -> {output_path}")
                await run_ffmpeg(task.input_path, str(output_path), task.target)
            else:
                # 文档转换
                source_ext = detect_ext_by_name(task.input_path)
                final_output = await run_document_conversion(
                    task.input_path, str(output_path), source_ext, task.target
                )
                output_path = Path(final_output)
            
            # 更新任务状态
            task.output_path = str(output_path)
            task.url = build_public_url(f"/public/{output_path.name}")
            task.download_url = build_download_url(output_path.name)
            task.preview_url = build_preview_url(output_path.name)
            task.state = TaskState.FINISHED
            task.updated_at = datetime.now()
            task_manager.update_task(task)
            
            file_size = format_file_size(output_path.stat().st_size)
            print(f"✅ 任务 {task.id} 完成: {task.url}, 大小: {file_size}")
            
            # 清理输入文件
            input_file = Path(task.input_path)
            if input_file.exists():
                input_file.unlink()
                print(f"🗑️ 已清理输入文件: {task.input_path}")
                
        except Exception as e:
            task.state = TaskState.ERROR
            task.error = str(e)
            task.updated_at = datetime.now()
            task_manager.update_task(task)
            print(f"❌ 任务 {task.id} 失败: {e}")
            
            # 清理输入文件
            input_file = Path(task.input_path)
            if input_file.exists():
                input_file.unlink()
                print(f"🗑️ 转换失败，已清理输入文件: {task.input_path}")


# MIME 类型映射
MIME_TYPES = {
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.html': 'text/html',
}


@general_router.get("/download/{filename}")
async def download_file(filename: str):
    """文件下载"""
    file_path = Path(settings.PUBLIC_DIR) / filename
    
    # 安全检查
    if not file_path.resolve().is_relative_to(Path(settings.PUBLIC_DIR).resolve()):
        raise HTTPException(status_code=403, detail="访问被拒绝")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Cache-Control": "public, max-age=3600"
        }
    )


@general_router.get("/preview/{filename}")
async def preview_file(filename: str):
    """文件预览"""
    file_path = Path(settings.PUBLIC_DIR) / filename
    
    # 安全检查
    if not file_path.resolve().is_relative_to(Path(settings.PUBLIC_DIR).resolve()):
        raise HTTPException(status_code=403, detail="访问被拒绝")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    ext = file_path.suffix.lower()
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    
    return FileResponse(
        path=file_path,
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Cache-Control": "public, max-age=3600"
        }
    )
