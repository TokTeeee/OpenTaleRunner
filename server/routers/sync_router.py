"""同步路由"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from repositories.world_repo import IWorldRepo
from repositories.chronicle_repo import IChronicleRepo
from repositories.encounter_repo import IEncounterRepo
from services.ghost_manager import GhostManager
from models.world import SyncUpdatesResponse, RealtimeSessionUpload, NearbyPlayersResponse
from routers.deps import get_world_repo, get_chronicle_repo, get_encounter_repo, get_ghost_manager, get_optional_player, get_current_player, get_db
from services.sync_updates import build_sync_updates

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


@router.get("/updates", response_model=SyncUpdatesResponse)
async def get_updates(
    player_id=Depends(get_optional_player),
    player_id_query: str | None = Query(default=None, alias="playerId"),
    region_id: str | None = Query(default=None, alias="regionId"),
    world_repo=Depends(get_world_repo),
    chron_repo=Depends(get_chronicle_repo),
    enc_repo=Depends(get_encounter_repo),
    ghost=Depends(get_ghost_manager),
):
    resolved_player_id = player_id or player_id_query or "player_local"
    return await build_sync_updates(
        resolved_player_id,
        world_repo,
        chron_repo,
        enc_repo,
        ghost,
        region_id=region_id,
    )


@router.put("/session")
async def upload_realtime_session(
    req: RealtimeSessionUpload,
    player_id: str = Depends(get_current_player),
    db=Depends(get_db),
):
    coords = json.dumps(req.coordinates or {"x": 0, "y": 0, "z": 0})
    await db.execute(
        """INSERT INTO player_realtime_sessions
           (player_id, character_name, region, sub_region, coordinates, world_day,
            current_action, status, is_online, last_heartbeat, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
           ON CONFLICT(player_id) DO UPDATE SET
           character_name=excluded.character_name,
           region=excluded.region,
           sub_region=excluded.sub_region,
           coordinates=excluded.coordinates,
           world_day=excluded.world_day,
           current_action=excluded.current_action,
           status=excluded.status,
           is_online=1,
           last_heartbeat=datetime('now')""",
        (player_id, req.character_name, req.region, req.sub_region,
         coords, req.world_day, req.current_action, req.status),
    )
    return {"message": "ok", "timestamp": datetime.now().isoformat()}


@router.get("/nearby-players", response_model=NearbyPlayersResponse)
async def get_nearby_players(
    region: str = Query(...),
    player_id: str = Depends(get_current_player),
    db=Depends(get_db),
):
    rows = await db.fetch_all(
        """SELECT * FROM player_realtime_sessions
           WHERE region = ? AND player_id != ? AND is_online = 1
           AND last_heartbeat > datetime('now', '-90 seconds')
           ORDER BY last_heartbeat DESC
           LIMIT 50""",
        (region, player_id),
    )

    nearby = []
    for r in rows:
        nearby.append({
            "player_id": r["player_id"],
            "character_name": r["character_name"],
            "region": r["region"],
            "sub_region": r.get("sub_region", ""),
            "coordinates": json.loads(r.get("coordinates", "{}") or "{}"),
            "current_action": r.get("current_action", ""),
            "status": r.get("status", "idle"),
            "world_day": r.get("world_day", 1),
            "last_heartbeat": r.get("last_heartbeat", ""),
        })

    return {"nearby_players": nearby}
