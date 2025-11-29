"""
速率限制中间件
"""
import time
from collections import defaultdict
from typing import Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """基于内存的速率限制中间件"""
    
    def __init__(self, app):
        super().__init__(app)
        # 存储格式: {ip: (points, reset_time)}
        self._storage: Dict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0))
        self._points = settings.RATE_LIMIT_POINTS
        self._duration = settings.RATE_LIMIT_DURATION
    
    async def dispatch(self, request: Request, call_next):
        # 获取客户端 IP
        client_ip = request.client.host if request.client else "anonymous"
        
        # 检查速率限制
        now = time.time()
        points, reset_time = self._storage[client_ip]
        
        # 如果已过期，重置
        if now > reset_time:
            points = 0
            reset_time = now + self._duration
        
        # 检查是否超过限制
        if points >= self._points:
            retry_after = int(reset_time - now)
            return JSONResponse(
                status_code=429,
                content={
                    "message": "请求过于频繁，请稍后再试",
                    "retryAfter": retry_after
                }
            )
        
        # 增加计数
        self._storage[client_ip] = (points + 1, reset_time)
        
        # 继续处理请求
        response = await call_next(request)
        return response
