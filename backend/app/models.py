"""
数据模型定义
"""
from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class Category(str, Enum):
    """文件分类"""
    DOCUMENT = "document"
    AUDIO = "audio"


class TaskState(str, Enum):
    """任务状态"""
    QUEUED = "queued"
    PROCESSING = "processing"
    FINISHED = "finished"
    ERROR = "error"


class ConvertTask(BaseModel):
    """转换任务模型"""
    id: str
    state: TaskState = TaskState.QUEUED
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    category: Category
    target: str
    source: Optional[str] = None
    input_path: str
    output_path: Optional[str] = None
    url: Optional[str] = None
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
    error: Optional[str] = None
    original_filename: Optional[str] = None


class UploadResponse(BaseModel):
    """上传响应"""
    taskId: str
    message: str


class TaskStatusResponse(BaseModel):
    """任务状态响应"""
    state: TaskState
    url: Optional[str] = None
    downloadUrl: Optional[str] = None
    previewUrl: Optional[str] = None
    message: Optional[str] = None


class SupportedFormatsResponse(BaseModel):
    """支持格式响应"""
    allowedExtensions: list[str]
    supportedConversions: dict[str, list[str]]


class DetectTargetsResponse(BaseModel):
    """检测目标格式响应"""
    filename: str
    category: Category
    sourceExtension: str
    supportedTargets: list[str]
    canConvert: bool


class ErrorResponse(BaseModel):
    """错误响应"""
    message: str
    supportedTargets: Optional[list[str]] = None
