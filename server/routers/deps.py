"""依赖注入工厂 — 所有 Depends() 函数集中于此"""

from fastapi import Depends, HTTPException, Header
from db.database import SqliteDatabase
from db.schema import SCHEMA
from db.seed import seed_all
from config import settings

# ---- 数据库单例 ----
_db: SqliteDatabase | None = None


async def get_db() -> SqliteDatabase:
    global _db
    if _db is None:
        _db = SqliteDatabase(settings.db_path)
        await _db.connect()
        for stmt in SCHEMA.split(";"):
            stmt = stmt.strip()
            if stmt:
                try:
                    await _db.execute(stmt)
                except Exception as e:
                    if "duplicate column name" in str(e) or "already exists" in str(e):
                        pass  # 列已存在，跳过ALTER
                    else:
                        raise e
        await seed_all(_db, settings.data_dir)
    return _db


# ---- Repositories ----
from repositories.player_repo import SqlitePlayerRepo
from repositories.character_repo import SqliteCharacterRepo
from repositories.chronicle_repo import SqliteChronicleRepo
from repositories.world_repo import SqliteWorldRepo
from repositories.npc_repo import SqliteNPCRepo
from repositories.encounter_repo import SqliteEncounterRepo, SqliteGhostRepo


async def get_player_repo(db=Depends(get_db)): return SqlitePlayerRepo(db)
async def get_character_repo(db=Depends(get_db)): return SqliteCharacterRepo(db)
async def get_chronicle_repo(db=Depends(get_db)): return SqliteChronicleRepo(db)
async def get_world_repo(db=Depends(get_db)): return SqliteWorldRepo(db)
async def get_npc_repo(db=Depends(get_db)): return SqliteNPCRepo(db)
async def get_encounter_repo(db=Depends(get_db)): return SqliteEncounterRepo(db)
async def get_ghost_repo(db=Depends(get_db)): return SqliteGhostRepo(db)


# ---- Services ----
from services.chronicle_engine import ChronicleEngine
from services.conflict_detector import ConflictDetector
from services.ghost_manager import GhostManager
from services.npc_service import NPCService
from services.milestone_service import MilestoneService


async def get_chronicle_engine(
    cr=Depends(get_chronicle_repo), wr=Depends(get_world_repo)
): return ChronicleEngine(cr, wr)

async def get_ghost_manager(
    gr=Depends(get_ghost_repo)
): return GhostManager(gr)

async def get_npc_service(
    nr=Depends(get_npc_repo), wr=Depends(get_world_repo)
): return NPCService(nr, wr)

async def get_milestone_service(
    wr=Depends(get_world_repo)
): return MilestoneService(wr)


# ---- Auth ----
import jwt as pyjwt
from datetime import datetime, timezone
from services.token_blacklist import blacklist
from models.auth import TokenResponse  # noqa: F401 — referenced by other modules

async def _verify_token(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")
    if blacklist.is_revoked(_token_digest(token)):
        raise HTTPException(401, "Token revoked")
    return payload


def _token_digest(token: str) -> str:
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


async def get_current_player(authorization: str = Header(None)) -> str:
    payload = await _verify_token(authorization)
    return payload.get("sub", "")


async def get_current_username(authorization: str = Header(None)) -> str:
    """v0.5.10 #7: 从 JWT token 解析 username, fallback 到 sub (player_id)."""
    payload = await _verify_token(authorization)
    username = payload.get("username", "")
    if not username:
        username = payload.get("sub", "")
    return username


async def get_optional_player(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None
    if blacklist.is_revoked(_token_digest(token)):
        return None
    return payload.get("sub")


async def require_fresh_token(authorization: str = Header(None)) -> str:
    payload = await _verify_token(authorization)
    iat = payload.get("iat")
    if not iat:
        raise HTTPException(401, "Token missing iat claim")
    now = datetime.now(timezone.utc).timestamp()
    if now - float(iat) > 300:
        raise HTTPException(403, "Token not fresh enough — please re-authenticate")
    return payload.get("sub", "")
