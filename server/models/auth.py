"""认证模型"""
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=32, pattern=r'^[a-zA-Z0-9_\-]+$')
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    token: str
    player_id: str
    username: str


class RefreshRequest(BaseModel):
    token: str


class LogoutResponse(BaseModel):
    message: str
