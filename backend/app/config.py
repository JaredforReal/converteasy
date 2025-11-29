"""
应用配置
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List, Dict


class Settings(BaseSettings):
    """应用配置类"""
    
    # 服务器配置
    PORT: int = int(os.getenv("PORT", "8080"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # 目录配置
    BASE_DIR: Path = Path(__file__).parent.parent
    PUBLIC_DIR: str = os.getenv("PUBLIC_DIR", "public")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    SCRIPTS_DIR: Path = Path(__file__).parent / "scripts"
    
    # 文件限制
    MAX_FILE_SIZE_MB: int = 100
    MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024
    
    # 允许的文件扩展名
    ALLOWED_DOC_EXT: List[str] = [
        ".pdf", ".doc", ".docx", ".ppt", ".pptx", 
        ".xls", ".xlsx", ".txt", ".rtf", ".html"
    ]
    ALLOWED_AUDIO_EXT: List[str] = [
        ".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"
    ]
    
    # 外部工具路径
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", "ffmpeg")
    SOFFICE_PATH: str = os.getenv("SOFFICE_PATH", "soffice")
    PYTHON_PATH: str = os.getenv("PYTHON_PATH", "python")
    
    # 公网访问 URL
    PUBLIC_BASE_URL: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8080")
    
    # 转换配置
    MAX_CONCURRENT: int = 2
    CONVERSION_TIMEOUT: int = 120  # 秒
    CLEANUP_INTERVAL: int = 3600  # 秒（1小时）
    FILE_EXPIRE_TIME: int = 24 * 60 * 60  # 秒（24小时）
    
    # 速率限制
    RATE_LIMIT_POINTS: int = 120
    RATE_LIMIT_DURATION: int = 60  # 秒
    
    # 音频质量设置
    AUDIO_QUALITY: Dict[str, str] = {
        "mp3": "-b:a 192k -ac 2",
        "wav": "-c:a pcm_s16le -ac 2",
        "aac": "-b:a 128k -ac 2",
        "flac": "-c:a flac -compression_level 5",
        "ogg": "-c:a libvorbis -qscale:a 5",
        "m4a": "-c:a aac -b:a 128k -ac 2"
    }
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# 转换支持映射
SUPPORTED_CONVERSIONS: Dict[str, Dict[str, List[str]]] = {
    "document": {
        "pdf": [".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".rtf"],
        "doc": [".docx", ".rtf", ".txt", ".odt", ".html", ".pdf"],
        "docx": [".doc", ".rtf", ".txt", ".odt", ".html", ".pdf"],
        "xlsx": [".xls", ".ods", ".csv", ".txt", ".pdf", ".doc"],
        "xls": [".xlsx", ".ods", ".csv", ".txt", ".pdf", ".doc"],
        "pptx": [".ppt", ".odp", ".pdf"],
        "ppt": [".pptx", ".odp", ".pdf"],
        "txt": [".doc", ".docx", ".rtf", ".odt", ".pdf", ".xls", ".xlsx"],
        "rtf": [".doc", ".docx", ".txt", ".odt"],
        "html": [".pdf", ".doc", ".docx"]
    },
    "audio": {
        "mp3": [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"],
        "wav": [".wav", ".mp3", ".aac", ".flac", ".m4a", ".ogg", ".wma"],
        "aac": [".aac", ".mp3", ".wav", ".m4a", ".flac"],
        "flac": [".flac", ".wav", ".mp3", ".aac"],
        "ogg": [".ogg", ".mp3", ".wav", ".flac"],
        "m4a": [".m4a", ".mp3", ".wav", ".aac"]
    }
}

# Python 脚本转换映射
PYTHON_CONVERSIONS: Dict[str, Dict[str, str]] = {
    "pdf->doc": {"script": "pdf_to_doc.py", "description": "PDF 转 Word"},
    "pdf->docx": {"script": "pdf_to_doc.py", "description": "PDF 转 Word"},
    "pdf->txt": {"script": "pdf_to_txt.py", "description": "PDF 转文本"},
    "pdf->xls": {"script": "pdf_to_xls.py", "description": "PDF 转 Excel"},
    "pdf->xlsx": {"script": "pdf_to_xls.py", "description": "PDF 转 Excel"},
    "pdf->ppt": {"script": "pdf_to_ppt.py", "description": "PDF 转 PowerPoint"},
    "pdf->pptx": {"script": "pdf_to_ppt.py", "description": "PDF 转 PowerPoint"},
    "doc->html": {"script": "doc_to_html.py", "description": "Word 转 HTML"},
    "docx->html": {"script": "doc_to_html.py", "description": "Word 转 HTML"},
    "xls->doc": {"script": "xls_to_doc.py", "description": "Excel 转 Word"},
    "xlsx->doc": {"script": "xls_to_doc.py", "description": "Excel 转 Word"},
    "xls->docx": {"script": "xls_to_doc.py", "description": "Excel 转 Word"},
    "xlsx->docx": {"script": "xls_to_doc.py", "description": "Excel 转 Word"},
    "xls->txt": {"script": "xls_to_txt.py", "description": "Excel 转文本"},
    "xlsx->txt": {"script": "xls_to_txt.py", "description": "Excel 转文本"},
    "txt->doc": {"script": "txt_to_word.py", "description": "文本转 Word"},
    "txt->docx": {"script": "txt_to_word.py", "description": "文本转 Word"},
    "txt->xls": {"script": "txt_to_xls.py", "description": "文本转 Excel"},
    "txt->xlsx": {"script": "txt_to_xls.py", "description": "文本转 Excel"},
    "html->doc": {"script": "html_to_word.py", "description": "HTML 转 Word"},
    "html->docx": {"script": "html_to_word.py", "description": "HTML 转 Word"},
    "html->pdf": {"script": "html_to_pdf.py", "description": "HTML 转 PDF"},
}


settings = Settings()
