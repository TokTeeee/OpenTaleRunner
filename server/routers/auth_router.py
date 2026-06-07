"""认证路由"""
import hashlib
import uuid
import jwt as pyjwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from models.auth import RegisterRequest, LoginRequest, TokenResponse, LogoutResponse
from repositories.player_repo import IPlayerRepo
from routers.deps import get_player_repo, get_current_player
from config import settings
from services.token_blacklist import blacklist

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _make_token(player_id: str, username: str = "") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": player_id,
        "username": username,
        "iat": now.timestamp(),
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
        "jti": uuid.uuid4().hex,
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, repo=Depends(get_player_repo)):
    try:
        player = await repo.register(req.username, req.password)
    except Exception:
        raise HTTPException(409, "Username already exists")
    token = _make_token(player["player_id"], player["username"])
    return TokenResponse(token=token, player_id=player["player_id"], username=player["username"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, repo=Depends(get_player_repo)):
    player = await repo.login(req.username, req.password)
    if not player:
        raise HTTPException(401, "Invalid credentials")
    token = _make_token(player["id"], player["username"])
    return TokenResponse(token=token, player_id=player["id"], username=player["username"])


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    player_id: str = Depends(get_current_player),
    authorization: str = Header(...),
):
    old_token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(old_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        exp = payload.get("exp", datetime.now(timezone.utc).timestamp() + 3600)
    except Exception:
        exp = datetime.now(timezone.utc).timestamp() + 3600
    blacklist.revoke(_token_digest(old_token), float(exp))
    # 从 old_token 解出 username (v0.5.10 #7: refresh 保留 username claim)
    old_username = ""
    try:
        old_payload = pyjwt.decode(
            old_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        old_username = old_payload.get("username", "")
    except Exception:
        pass
    token = _make_token(player_id, old_username)
    return TokenResponse(token=token, player_id=player_id, username=old_username)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    player_id: str = Depends(get_current_player),
    authorization: str = Header(...),
):
    raw_token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(raw_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        exp = payload.get("exp", datetime.now(timezone.utc).timestamp() + 3600)
    except Exception:
        exp = datetime.now(timezone.utc).timestamp() + 3600
    blacklist.revoke(_token_digest(raw_token), float(exp))
    return LogoutResponse(message="Logged out")
