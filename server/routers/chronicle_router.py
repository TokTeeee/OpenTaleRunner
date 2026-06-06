"""编年史路由"""
import json
from fastapi import APIRouter, Depends
from models.chronicle import ChronicleLogBatch, PushResult
from repositories.chronicle_repo import IChronicleRepo
from services.chronicle_engine import ChronicleEngine
from services.ghost_manager import GhostManager
from services.conflict_detector import ConflictDetector
from routers.deps import get_chronicle_repo, get_chronicle_engine, get_ghost_manager, get_optional_player, get_db
from services.world_update_stream import world_update_broadcaster

router = APIRouter(prefix="/api/v1/chronicle", tags=["chronicle"])


@router.post("/upload", response_model=PushResult)
async def upload_chronicle(
    batch: ChronicleLogBatch,
    player_id=Depends(get_optional_player),
    db=Depends(get_db),
    repo=Depends(get_chronicle_repo),
    engine=Depends(get_chronicle_engine),
    ghost=Depends(get_ghost_manager),
):
    resolved_player_id = player_id or batch.playerId or (batch.entries[0].playerId if batch.entries else "player_local")
    count = await repo.upload_batch(resolved_player_id, [e.model_dump() for e in batch.entries])

    # Update player activity
    last = batch.entries[-1] if batch.entries else None
    if last:
        loc = last.location
        coords = json.dumps(loc.get("coordinates", {"x":0,"y":0,"z":0}))
        await db.execute(
            "INSERT OR REPLACE INTO player_activity (player_id, character_name, region, sub_region, coordinates, world_day, last_active) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
            (resolved_player_id, last.characterName, loc.get("region", ""), loc.get("subRegion", ""), coords, last.worldDay))

    # 触发聚合（如果条件满足）
    for entry in batch.entries:
        region = entry.location.get("region", "")
        if region:
            await engine.aggregate_region(region, entry.worldDay)

    # 更新幽灵NPC
    last = batch.entries[-1] if batch.entries else None
    if last:
        await ghost.upsert_from_character(
            resolved_player_id,
            {"name": last.characterName},
            last.location.get("region", ""),
            last.action.get("summary", ""),
        )

    world_update_broadcaster.publish("chronicle_uploaded")

    return PushResult(uploaded=count, failed=0, newEncounters=[])


@router.post("/upload/single")
async def upload_single(data: dict, player_id=Depends(get_optional_player), repo=Depends(get_chronicle_repo)):
    resolved_player_id = player_id or data.get("playerId") or "player_local"
    await repo.upload_batch(resolved_player_id, [data])
    world_update_broadcaster.publish("chronicle_uploaded")
    return {"ok": True}
