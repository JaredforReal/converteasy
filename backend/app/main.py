"""
ConvertEasy Backend - FastAPI 文件格式转换服务
"""
import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import convert
from app.utils.file_utils import ensure_dir, cleanup_expired_files, check_dependencies


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print(f"🚀 服务器启动中...")
    print(f"📍 服务地址: http://{settings.HOST}:{settings.PORT}")
    print(f"🌐 公网地址: {settings.PUBLIC_BASE_URL}")
    print(f"📦 文件大小限制: {settings.MAX_FILE_SIZE_MB}MB")
    print(f"📄 支持文档格式: {', '.join(settings.ALLOWED_DOC_EXT)}")
    print(f"🎵 支持音频格式: {', '.join(settings.ALLOWED_AUDIO_EXT)}")
    print(f"⚡ 并发转换数: {settings.MAX_CONCURRENT}")
    
    # 确保目录存在
    ensure_dir(settings.UPLOAD_DIR)
    ensure_dir(settings.PUBLIC_DIR)
    
    # 启动时清理过期文件
    print("🧹 执行启动清理...")
    await cleanup_expired_files()
    
    # 检查依赖
    print("🔍 检查系统依赖...")
    await check_dependencies()
    
    # 启动定时清理任务
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    print("✅ 服务器启动完成")
    
    yield
    
    # 关闭时
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    print("👋 服务器已关闭")


async def periodic_cleanup():
    """定时清理过期文件"""
    while True:
        await asyncio.sleep(settings.CLEANUP_INTERVAL)
        print("🧹 执行定时清理...")
        await cleanup_expired_files()


# 创建 FastAPI 应用
app = FastAPI(
    title="ConvertEasy Backend",
    description="文件格式转换服务 - 支持文档和音频格式互转",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 速率限制中间件
from app.middleware.rate_limiter import RateLimiterMiddleware
app.add_middleware(RateLimiterMiddleware)


# 静态文件服务
app.mount("/public", StaticFiles(directory=settings.PUBLIC_DIR), name="public")


# 注册路由
app.include_router(convert.router, prefix="/convert", tags=["转换"])
app.include_router(convert.general_router, tags=["通用"])


@app.get("/health")
async def health_check():
    """健康检查"""
    from datetime import datetime
    return {
        "ok": True,
        "timestamp": datetime.now().isoformat(),
        "service": "converteasy-backend",
        "version": "2.0.0"
    }


@app.get("/server-status")
async def server_status():
    """服务器状态"""
    import platform
    import psutil
    from datetime import datetime
    from app.utils.task_manager import task_manager
    
    # 获取目录文件统计
    uploads_count = len(list(Path(settings.UPLOAD_DIR).glob("*"))) if Path(settings.UPLOAD_DIR).exists() else 0
    public_count = len(list(Path(settings.PUBLIC_DIR).glob("*"))) if Path(settings.PUBLIC_DIR).exists() else 0
    
    # 获取任务统计
    task_stats = task_manager.get_stats()
    
    return {
        "status": "running",
        "timestamp": datetime.now().isoformat(),
        "server": {
            "host": settings.HOST,
            "port": settings.PORT,
            "publicBaseUrl": settings.PUBLIC_BASE_URL
        },
        "tasks": task_stats,
        "files": {
            "uploads": uploads_count,
            "public": public_count
        },
        "system": {
            "platform": platform.system(),
            "arch": platform.machine(),
            "python_version": platform.python_version(),
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "memory_available": f"{psutil.virtual_memory().available / (1024**3):.1f} GB"
        }
    }


@app.post("/cleanup")
async def manual_cleanup():
    """手动清理过期文件"""
    from datetime import datetime
    try:
        await cleanup_expired_files()
        return {
            "message": "清理完成",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "message": "清理失败",
                "error": str(e)
            }
        )


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理"""
    print(f"❌ 服务器错误: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "message": str(exc) if str(exc) else "服务器错误",
            "timestamp": __import__("datetime").datetime.now().isoformat()
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
