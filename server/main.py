"""艾瑟兰 服务端入口"""
import asyncio
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers.deps import get_db
from routers import (
    auth_router, storybook_router, world_router, character_router,
    chronicle_router, sync_router, encounter_router, npc_router, event_router,
    activity_router, multiplayer_router,
)
from logging_config import api_log, request_log
from services.event_generator import generate_event_templates
from services.npc_behavior.scheduler import NPCBehaviorScheduler
from services.chronicle_engine import ChronicleEngine
from repositories.chronicle_repo import SqliteChronicleRepo
from repositories.world_repo import SqliteWorldRepo
from repositories.encounter_repo import SqliteGhostRepo
from services.world_update_stream import world_update_broadcaster
from config import settings
from middleware import RateLimiter
from services.token_blacklist import blacklist

_npc_scheduler: NPCBehaviorScheduler | None = None
_bg_tasks: list[asyncio.Task] = []


async def _chronicle_loop(db, interval: int = 3600):
    """定期编年史聚合 + 推进世界日"""
    chron_repo = SqliteChronicleRepo(db)
    world_repo = SqliteWorldRepo(db)
    engine = ChronicleEngine(chron_repo, world_repo)
    while True:
        try:
            wd = await world_repo.get_world_day()
            rows = await db.fetch_all("SELECT DISTINCT region FROM chronicle_entries WHERE world_day=?", (wd,))
            aggregated = 0
            for row in rows:
                region = row["region"]
                if region:
                    result = await engine.aggregate_region(region, wd)
                    if result: aggregated += 1
            # Advance world day if any regions were aggregated
            if aggregated > 0:
                await world_repo.set_world_day(wd + 1)
                world_update_broadcaster.publish("world_day_advanced")
                api_log.info(f"World day advanced: {wd} → {wd + 1} ({aggregated} regions)")
        except Exception as e:
            api_log.warning(f"Chronicle loop error: {e}")
        await asyncio.sleep(interval)


async def _ghost_cleanup_loop(db, interval: int = 3600):
    """定期清理过期幽灵NPC"""
    ghost_repo = SqliteGhostRepo(db)
    while True:
        try:
            count = await ghost_repo.remove_expired()
            if count:
                api_log.info(f"Ghost cleanup: {count} expired NPCs removed")
        except Exception as e:
            api_log.warning(f"Ghost cleanup error: {e}")
        await asyncio.sleep(interval)


async def _presence_cleanup_loop(db, interval: int = 30, timeout: int = 90):
    """定期将心跳过期的实时会话/活动实体标记为离线"""
    timeout_expr = f"-{timeout} seconds"
    while True:
        try:
            realtime_cur = await db.execute(
                """UPDATE player_realtime_sessions
                   SET is_online=0
                   WHERE is_online=1
                     AND datetime(last_heartbeat) <= datetime('now', ?)""",
                (timeout_expr,),
            )
            activity_cur = await db.execute(
                """UPDATE player_activity
                   SET is_online=0
                   WHERE is_online=1
                     AND datetime(last_active) <= datetime('now', ?)""",
                (timeout_expr,),
            )
            expired = (getattr(realtime_cur, "rowcount", 0) or 0) + (getattr(activity_cur, "rowcount", 0) or 0)
            if expired:
                api_log.info(f"Presence cleanup: {expired} expired sessions marked offline (timeout={timeout}s)")
        except Exception as e:
            api_log.warning(f"Presence cleanup error: {e}")
        await asyncio.sleep(interval)


async def _blacklist_cleanup_loop(interval: int = 600):
    """定期清理过期的 token 黑名单条目"""
    while True:
        try:
            removed = blacklist.cleanup_expired()
            if removed:
                api_log.info(f"Token blacklist cleanup: {removed} expired entries removed")
        except Exception as e:
            api_log.warning(f"Blacklist cleanup error: {e}")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _npc_scheduler, _bg_tasks
    api_log.info("Service starting...")
    db = await get_db()
    api_log.info(f"Database connected: {db.db_path}")
    evt_count = await generate_event_templates(db)
    api_log.info(f"Event templates: {evt_count} new")

    _npc_scheduler = NPCBehaviorScheduler(db, tick_interval=300)
    _npc_scheduler.start()
    api_log.info("NPC Behavior Scheduler started (interval=300s)")

    # 启动后台定时任务
    _bg_tasks.append(asyncio.create_task(_chronicle_loop(db, 3600)))
    _bg_tasks.append(asyncio.create_task(_ghost_cleanup_loop(db, 3600)))
    _bg_tasks.append(asyncio.create_task(_presence_cleanup_loop(db, 30, 90)))
    api_log.info("Chronicle aggregation + Ghost cleanup loops started (interval=3600s)")

    # 启动多人联机后台任务
    from repositories.multiplayer_repo import SqliteMultiplayerRepo
    from services.multiplayer_service import MultiplayerService
    mp_repo = SqliteMultiplayerRepo(db)
    mp_service = MultiplayerService(mp_repo)
    _bg_tasks.append(asyncio.create_task(mp_service.heartbeat_checker_loop()))
    api_log.info("Multiplayer heartbeat checker loop started (interval=30s)")

    _bg_tasks.append(asyncio.create_task(_blacklist_cleanup_loop(600)))
    api_log.info("Token blacklist cleanup loop started (interval=600s)")

    yield

    if _npc_scheduler:
        _npc_scheduler.stop()
    for task in _bg_tasks:
        task.cancel()
    _bg_tasks.clear()
    api_log.info("Service stopped")


app = FastAPI(title="Aeslan Server", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimiter)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    client = request.client.host if request.client else "unknown"
    request_log.info(
        "%s %s → %d (%.2fs) [%s]",
        request.method, request.url.path, response.status_code, elapsed, client,
    )
    return response

app.include_router(auth_router.router)
app.include_router(storybook_router.router)
app.include_router(world_router.router)
app.include_router(character_router.router)
app.include_router(chronicle_router.router)
app.include_router(sync_router.router)
app.include_router(encounter_router.router)
app.include_router(npc_router.router)
app.include_router(event_router.router)
app.include_router(activity_router.router)
app.include_router(multiplayer_router.router)


@app.get("/")
async def root():
    return {"service": "Aeslan", "version": "0.1.0", "status": "running"}
