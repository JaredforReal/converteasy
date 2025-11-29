"""
转换工具函数 - FFmpeg 和 LibreOffice 转换
"""
import os
import asyncio
import shutil
from pathlib import Path
from typing import Optional, Dict

from app.config import settings, PYTHON_CONVERSIONS


async def run_ffmpeg(input_path: str, output_path: str, target_format: str) -> None:
    """运行 FFmpeg 进行音频转换"""
    quality = settings.AUDIO_QUALITY.get(target_format, "")
    
    # 优化参数
    base_params = "-hide_banner -loglevel error -stats -y"
    format_params = {
        "mp3": f"{base_params} -c:a libmp3lame -threads 0 -af 'volume=1.0'",
        "wav": f"{base_params} -c:a pcm_s16le -ac 2",
        "aac": f"{base_params} -c:a aac -threads 0 -movflags +faststart",
        "flac": f"{base_params} -compression_level 8",
        "ogg": f"{base_params} -c:a libvorbis -qscale:a 5",
        "m4a": f"{base_params} -c:a aac -b:a 128k -movflags +faststart",
    }
    
    optimized_params = format_params.get(target_format, base_params)
    
    ffmpeg_path = shutil.which(settings.FFMPEG_PATH) or settings.FFMPEG_PATH
    cmd = f'"{ffmpeg_path}" -i "{input_path}" {optimized_params} {quality} "{output_path}"'
    
    print(f"🎵 Running FFmpeg: {cmd}")
    
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(), 
        timeout=settings.CONVERSION_TIMEOUT
    )
    
    if stdout:
        print(f"FFmpeg output: {stdout.decode()}")
    if stderr:
        print(f"FFmpeg warnings: {stderr.decode()}")
    
    # 验证输出文件
    output = Path(output_path)
    if not output.exists():
        raise Exception("FFmpeg 转换失败，输出文件未生成")
    
    if output.stat().st_size == 0:
        output.unlink()
        raise Exception("FFmpeg 转换失败，输出文件为空")


async def run_soffice(input_path: str, output_dir: str, target_format: str) -> str:
    """运行 LibreOffice 进行文档转换"""
    # 查找 LibreOffice
    common_paths = [
        "/usr/bin/soffice",
        "/usr/local/bin/soffice",
        "/snap/bin/soffice",
        "/opt/libreoffice/program/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    
    soffice_path = settings.SOFFICE_PATH
    for path in common_paths:
        if Path(path).exists():
            soffice_path = path
            break
    
    soffice_path = shutil.which(soffice_path) or soffice_path
    
    cmd = (
        f'"{soffice_path}" --headless --norestore --nofirststartwizard '
        f'--nologo --nodefault --view --convert-to {target_format} '
        f'--outdir "{output_dir}" "{input_path}"'
    )
    
    print(f"📄 Running LibreOffice: {cmd}")
    
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "HOME": "/tmp"}
    )
    
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(),
        timeout=settings.CONVERSION_TIMEOUT
    )
    
    if stdout:
        print(f"LibreOffice output: {stdout.decode()}")
    if stderr:
        print(f"LibreOffice warnings: {stderr.decode()}")
    
    # 查找输出文件
    output_dir_path = Path(output_dir)
    converted_files = list(output_dir_path.glob(f"*.{target_format}"))
    
    if not converted_files:
        raise Exception(f"LibreOffice 转换失败，未生成 .{target_format} 文件")
    
    # 返回最新的文件
    latest_file = max(converted_files, key=lambda f: f.stat().st_mtime)
    print(f"✓ LibreOffice 转换完成: {latest_file}")
    
    return str(latest_file)


async def run_python_conversion(input_path: str, output_path: str, conversion_key: str) -> None:
    """运行 Python 脚本进行转换"""
    if conversion_key not in PYTHON_CONVERSIONS:
        raise Exception(f"不支持的转换类型: {conversion_key}")
    
    script_info = PYTHON_CONVERSIONS[conversion_key]
    script_path = settings.SCRIPTS_DIR / script_info["script"]
    
    if not script_path.exists():
        raise Exception(f"转换脚本不存在: {script_path}")
    
    python_path = shutil.which(settings.PYTHON_PATH) or settings.PYTHON_PATH
    cmd = f'"{python_path}" "{script_path}" -i "{input_path}" -o "{output_path}"'
    
    print(f"🐍 Running Python conversion: {cmd}")
    print(f"   转换类型: {script_info['description']}")
    
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "PYTHONPATH": str(script_path.parent)}
    )
    
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(),
        timeout=settings.CONVERSION_TIMEOUT
    )
    
    if stdout:
        print(f"Python output: {stdout.decode()}")
    if stderr:
        print(f"Python warnings: {stderr.decode()}")
    
    # 验证输出文件
    output = Path(output_path)
    if not output.exists():
        raise Exception("Python 转换失败，输出文件未生成")
    
    if output.stat().st_size == 0:
        output.unlink()
        raise Exception("Python 转换失败，输出文件为空")
    
    print(f"✓ Python 转换成功: {input_path} -> {output_path}")


async def run_document_conversion(
    input_path: str, 
    output_path: str, 
    source_ext: str, 
    target_format: str
) -> str:
    """执行文档转换"""
    source_format = source_ext.replace(".", "")
    conversion_key = f"{source_format}->{target_format}"
    
    print(f"📄 开始文档转换: {input_path} -> {output_path}")
    print(f"   转换类型: {source_format} -> {target_format}")
    
    # 检查是否需要 Python 脚本
    if conversion_key in PYTHON_CONVERSIONS:
        print(f"   使用 Python 脚本: {PYTHON_CONVERSIONS[conversion_key]['description']}")
        await run_python_conversion(input_path, output_path, conversion_key)
        return output_path
    else:
        # 使用 LibreOffice
        print(f"   使用 LibreOffice")
        output_dir = str(Path(output_path).parent)
        actual_output = await run_soffice(input_path, output_dir, target_format)
        
        # 如果输出文件名不一致，重命名
        if actual_output != output_path and Path(actual_output).exists():
            try:
                shutil.move(actual_output, output_path)
                return output_path
            except Exception as e:
                print(f"⚠ 重命名失败，使用原文件名: {e}")
                return actual_output
        
        return output_path
