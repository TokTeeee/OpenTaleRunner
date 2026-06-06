"""世界状态路由"""
import asyncio
import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from repositories.world_repo import IWorldRepo
from repositories.chronicle_repo import IChronicleRepo
from services.ghost_manager import GhostManager
from services.terrain_service import get_terrain, get_weather, register_location, get_all_terrain, get_roads, get_waters
from services.aliases import alias_region, get_all_region_aliases, get_all_terrain_aliases
from routers.deps import get_world_repo, get_chronicle_repo, get_ghost_manager, get_db, get_encounter_repo, get_optional_player
from services.sync_updates import build_sync_updates
from services.world_update_stream import world_update_broadcaster

router = APIRouter(prefix="/api/v1/world", tags=["world"])


def _encode_sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/state/{region_id}")
async def get_region_state(region_id: str, repo=Depends(get_world_repo)):
    state = await repo.get_region_state(region_id)
    if not state:
        return {"id": region_id, "name": alias_region(region_id), "weather": "晴朗", "factions": [], "subRegions": [], "currentEvents": []}
    state["name"] = alias_region(region_id)
    state["display_name"] = alias_region(region_id)
    return state


@router.get("/chronicle")
async def get_world_chronicle(day: int | None = None, repo=Depends(get_chronicle_repo)):
    return await repo.get_world_chronicle(world_day=day, limit=20)


@router.get("/chronicle/latest")
async def get_latest_chronicle(repo=Depends(get_chronicle_repo)):
    return await repo.get_latest_world_chronicle(limit=5)


@router.get("/timeline")
async def get_timeline(repo=Depends(get_world_repo)):
    return {"worldDay": await repo.get_world_day()}


@router.get("/stream")
async def stream_world_updates(
    player_id=Depends(get_optional_player),
    player_id_query: str | None = Query(default=None, alias="playerId"),
    region_id: str | None = Query(default=None, alias="regionId"),
    world_repo=Depends(get_world_repo),
    chron_repo=Depends(get_chronicle_repo),
    enc_repo=Depends(get_encounter_repo),
    ghost=Depends(get_ghost_manager),
):
    resolved_player_id = player_id or player_id_query or "player_local"

    async def event_stream():
        queue = world_update_broadcaster.subscribe()
        try:
            initial = await build_sync_updates(
                resolved_player_id,
                world_repo,
                chron_repo,
                enc_repo,
                ghost,
                region_id=region_id,
            )
            yield _encode_sse("world_update", initial.model_dump())

            while True:
                try:
                    reason = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue

                payload = await build_sync_updates(
                    resolved_player_id,
                    world_repo,
                    chron_repo,
                    enc_repo,
                    ghost,
                    region_id=region_id,
                )
                data = payload.model_dump()
                data["reason"] = reason
                yield _encode_sse("world_update", data)
        finally:
            world_update_broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/ghost-npcs/{region_id}")
async def get_ghost_npcs(region_id: str, gm=Depends(get_ghost_manager)):
    return await gm.get_region_ghosts(region_id)


@router.get("/terrain")
async def terrain(region: str, x: int = 0, y: int = 0, z: int = 0, db=Depends(get_db)):
    return await get_terrain(db, region, x, y, z)


@router.get("/weather")
async def weather(region: str, day: int = 1, db=Depends(get_db)):
    w = await get_weather(db, region, day)
    return {"region": region, "display_name": alias_region(region), "world_day": day, "weather": w}


@router.get("/aliases")
async def aliases():
    return {"regions": get_all_region_aliases(), "terrains": get_all_terrain_aliases()}


@router.post("/locations")
async def create_location(body: dict, db=Depends(get_db)):
    wd = body.get("world_day", 1)
    await register_location(db, body["region"], body["x"], body.get("y", 0), body["z"], body.get("terrain_type", "地点"), body.get("description", ""), wd)
    return {"ok": True}


@router.get("/map")
async def world_map(region: str | None = None, world_day: int | None = None, db=Depends(get_db)):
    return await get_all_terrain(db, region, world_day)


@router.get("/roads")
async def roads(region: str | None = None, db=Depends(get_db)):
    roads = await get_roads(db)
    if region:
        roads = [r for r in roads if r.get("region", "") == region]
    return roads


@router.get("/waters")
async def waters(region: str | None = None, db=Depends(get_db)):
    waters = await get_waters(db)
    if region:
        waters = [w for w in waters if w.get("region", "") == region]
    return waters
