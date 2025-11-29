"""
文件工具函数
"""
import os
import asyncio
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from app.config import settings, SUPPORTED_CONVERSIONS, PYTHON_CONVERSIONS


def ensure_dir(dir_path: str) -> None:
    """确保目录存在"""
    Path(dir_path).mkdir(parents=True, exist_ok=True)


def detect_ext_by_name(filename: str) -> str:
    """根据文件名检测扩展名"""
    return Path(filename).suffix.lower()


def is_allowed_ext(category: str, ext: str) -> bool:
    """检查扩展名是否允许"""
    if category == "document":
        return ext in settings.ALLOWED_DOC_EXT
    elif category == "audio":
        return ext in settings.ALLOWED_AUDIO_EXT
    return False


def is_conversion_supported(category: str, source_ext: str, target_format: str) -> bool:
    """验证转换是否支持"""
    if category != "document":
        conversions = SUPPORTED_CONVERSIONS.get(category, {})
        return target_format in conversions and source_ext in conversions[target_format]
    
    conversions = SUPPORTED_CONVERSIONS.get("document", {})
    if target_format not in conversions:
        return False
    
    source_format = source_ext.replace(".", "")
    conversion_key = f"{source_format}->{target_format}"
    
    # 检查是否需要 Python 脚本
    if conversion_key in PYTHON_CONVERSIONS:
        script_path = settings.SCRIPTS_DIR / PYTHON_CONVERSIONS[conversion_key]["script"]
        if not script_path.exists():
            print(f"⚠ Python 脚本不存在: {script_path}")
            return False
        return True
    
    # LibreOffice 转换
    return source_ext in conversions.get(target_format, [])


def get_supported_targets(category: str, source_ext: str) -> List[str]:
    """获取支持的转换目标格式"""
    if category != "document":
        conversions = SUPPORTED_CONVERSIONS.get(category, {})
        supported = []
        for target, sources in conversions.items():
            if source_ext in sources:
                supported.append(target)
        return supported
    
    conversions = SUPPORTED_CONVERSIONS.get("document", {})
    supported = []
    source_format = source_ext.replace(".", "")
    
    for target, sources in conversions.items():
        conversion_key = f"{source_format}->{target}"
        
        if conversion_key in PYTHON_CONVERSIONS:
            script_path = settings.SCRIPTS_DIR / PYTHON_CONVERSIONS[conversion_key]["script"]
            if script_path.exists():
                supported.append(target)
        elif source_ext in sources:
            supported.append(target)
    
    return supported


def format_file_size(bytes_size: int) -> str:
    """格式化文件大小"""
    if bytes_size < 1024:
        return f"{bytes_size} B"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    elif bytes_size < 1024 * 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.1f} MB"
    return f"{bytes_size / (1024 * 1024 * 1024):.1f} GB"


def build_public_url(pathname: str) -> str:
    """构建公网访问 URL"""
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base}{pathname}"


def build_download_url(filename: str) -> str:
    """构建下载 URL"""
    return build_public_url(f"/download/{filename}")


def build_preview_url(filename: str) -> str:
    """构建预览 URL"""
    return build_public_url(f"/preview/{filename}")


async def cleanup_expired_files() -> None:
    """清理过期文件"""
    from app.utils.task_manager import task_manager
    
    now = datetime.now()
    expire_time = settings.FILE_EXPIRE_TIME
    
    print(f"🧹 开始清理过期文件，当前时间: {now.isoformat()}")
    
    # 清理过期任务和文件
    expired_tasks = task_manager.get_expired_tasks(expire_time)
    for task in expired_tasks:
        # 删除输入文件
        if task.input_path and Path(task.input_path).exists():
            try:
                Path(task.input_path).unlink()
                print(f"✓ 清理过期输入文件: {task.input_path}")
            except Exception as e:
                print(f"✗ 清理输入文件失败: {task.input_path} - {e}")
        
        # 删除输出文件
        if task.output_path and Path(task.output_path).exists():
            try:
                Path(task.output_path).unlink()
                print(f"✓ 清理过期输出文件: {task.output_path}")
            except Exception as e:
                print(f"✗ 清理输出文件失败: {task.output_path} - {e}")
        
        task_manager.delete_task(task.id)
        print(f"✓ 清理过期任务: {task.id}")
    
    # 清理 uploads 目录中的孤立文件（超过1小时）
    await cleanup_orphaned_files(settings.UPLOAD_DIR, 3600, "uploads")
    
    # 清理 public 目录中的孤立文件（超过24小时）
    await cleanup_orphaned_files(settings.PUBLIC_DIR, 86400, "public")


async def cleanup_orphaned_files(directory: str, max_age: int, dir_name: str) -> None:
    """清理孤立文件"""
    try:
        dir_path = Path(directory)
        if not dir_path.exists():
            return
        
        now = datetime.now()
        cleaned_count = 0
        
        for file_path in dir_path.iterdir():
            if file_path.is_dir():
                continue
            
            try:
                mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if (now - mtime).total_seconds() > max_age:
                    # 跳过友好命名的文件
                    import re
                    if re.search(r'_\d{8,10}\.', file_path.name):
                        continue
                    
                    file_path.unlink()
                    print(f"✓ 清理孤立文件 ({dir_name}): {file_path}")
                    cleaned_count += 1
            except Exception as e:
                print(f"✗ 检查文件失败: {file_path} - {e}")
        
        if cleaned_count > 0:
            print(f"📁 在 {dir_name} 目录中清理了 {cleaned_count} 个孤立文件")
    except Exception as e:
        print(f"✗ 清理 {dir_name} 目录失败: {e}")


async def check_dependencies() -> None:
    """检查系统依赖"""
    import shutil
    
    # 检查 LibreOffice
    soffice_path = shutil.which(settings.SOFFICE_PATH) or settings.SOFFICE_PATH
    try:
        proc = await asyncio.create_subprocess_exec(
            soffice_path, "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            version = stdout.decode().split('\n')[0] if stdout else "unknown"
            print(f"✓ LibreOffice 可用: {version}")
        else:
            print("⚠ LibreOffice 检查失败")
    except Exception as e:
        print(f"⚠ LibreOffice 不可用: {e}")
    
    # 检查 FFmpeg
    ffmpeg_path = shutil.which(settings.FFMPEG_PATH) or settings.FFMPEG_PATH
    try:
        proc = await asyncio.create_subprocess_exec(
            ffmpeg_path, "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            version = stdout.decode().split('\n')[0] if stdout else "unknown"
            print(f"✓ FFmpeg 可用: {version}")
        else:
            print("⚠ FFmpeg 检查失败")
    except Exception as e:
        print(f"⚠ FFmpeg 不可用: {e}")
    
    # 检查 Python 依赖
    try:
        proc = await asyncio.create_subprocess_exec(
            settings.PYTHON_PATH, "-c", "import pdf2docx, pdfplumber, docx, openpyxl, pandas",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate()
        if proc.returncode == 0:
            print("✓ Python 转换依赖可用")
        else:
            print(f"⚠ 部分 Python 依赖缺失: {stderr.decode()[:100]}")
    except Exception as e:
        print(f"⚠ Python 环境检查失败: {e}")
