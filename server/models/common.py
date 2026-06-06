"""通用 Pydantic 模型"""
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: str | None = None


class PaginationParams(BaseModel):
    offset: int = 0
    limit: int = 50
