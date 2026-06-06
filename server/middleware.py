"""简易令牌桶速率限制中间件 — 基于 IP 的请求频率控制"""
import time
import threading
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from config import settings


class RateLimiter(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()
        self._rate = settings.rate_limit
        self._window = settings.rate_window

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        key = client_ip

        allowed = False
        with self._lock:
            now = time.time()
            entry = self._buckets.get(key)
            if entry is None:
                self._buckets[key] = (now, 1)
                allowed = True
            else:
                last_time, count = entry
                if now - last_time > self._window:
                    self._buckets[key] = (now, 1)
                    allowed = True
                elif count < self._rate:
                    self._buckets[key] = (last_time, count + 1)
                    allowed = True

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded ({self._rate} req/{self._window}s)"},
            )

        return await call_next(request)
