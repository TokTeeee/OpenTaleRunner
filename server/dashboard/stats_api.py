"""看板统计API — 只读查询，公开数据"""
import json
from fastapi import APIRouter
from db.database import SqliteDatabase
from config import settings
from services.terrain_service import get_waters, get_roads

router = APIRouter(prefix="/api/stats", tags=["stats"])


def storybook_world_name(storybook: dict) -> str:
    return storybook.get("world_name") or storybook.get("worldName") or "当前世界"


async def get_db() -> SqliteDatabase:
    db = SqliteDatabase(settings.db_path)
    await db.connect()
    return db


@router.get("/overview")
async def overview():
    db = await get_db()
    try:
        players = await db.fetch_all("SELECT COUNT(*) as c FROM players")
        chars = await db.fetch_all("SELECT COUNT(*) as c FROM characters")
        chronicles = await db.fetch_all("SELECT COUNT(*) as c FROM chronicle_entries")
        npcs = await db.fetch_all("SELECT COUNT(*) as c FROM npc_registry")
        promoted = await db.fetch_all("SELECT COUNT(*) as c FROM npc_registry WHERE promoted=1")
        ghost = await db.fetch_all("SELECT COUNT(*) as c FROM ghost_npcs WHERE expires_at > datetime('now')")
        active = await db.fetch_all("SELECT COUNT(*) as c FROM player_activity WHERE last_active > datetime('now', '-2 hours')")
        wd = await db.fetch_one("SELECT value FROM world_meta WHERE key='world_day'")
        sb_raw = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
        sb = json.loads(sb_raw["value"]) if sb_raw else {}
        milestones = await db.fetch_all("SELECT * FROM milestones")
        regions = await db.fetch_all("SELECT region_id, weather FROM world_state")
        region_list = []
        for r in regions:
            cc = await db.fetch_one("SELECT COUNT(*) as c FROM characters WHERE region=?", (r["region_id"],))
            nc = await db.fetch_one("SELECT COUNT(*) as c FROM npc_registry WHERE region=?", (r["region_id"],))
            region_list.append({"id": r["region_id"], "weather": r["weather"], "character_count": cc["c"] if cc else 0, "npc_count": nc["c"] if nc else 0})
        return {
            "world_day": int(wd["value"]) if wd else 1, "world_name": storybook_world_name(sb),
            "current_era": sb.get("current_era", ""), "total_players": players[0]["c"] if players else 0,
            "total_characters": chars[0]["c"] if chars else 0, "total_chronicle_entries": chronicles[0]["c"] if chronicles else 0,
            "total_npcs": npcs[0]["c"] if npcs else 0, "promoted_npcs": promoted[0]["c"] if promoted else 0,
            "active_ghost_npcs": ghost[0]["c"] if ghost else 0, "active_players_2h": active[0]["c"] if active else 0,
            "milestones": [dict(m) for m in milestones], "regions": region_list,
        }
    finally:
        await db.close()


@router.get("/regions")
async def regions():
    db = await get_db()
    try:
        rows = await db.fetch_all("SELECT region_id, weather, current_events FROM world_state")
        result = []
        for r in rows:
            cc = await db.fetch_one("SELECT COUNT(*) as c FROM characters WHERE region=?", (r["region_id"],))
            nc = await db.fetch_one("SELECT COUNT(*) as c FROM npc_registry WHERE region=?", (r["region_id"],))
            result.append({"region_id": r["region_id"], "weather": r["weather"],
                "character_count": cc["c"] if cc else 0, "npc_count": nc["c"] if nc else 0,
                "current_events": json.loads(r.get("current_events", "[]"))})
        return result
    finally:
        await db.close()


@router.get("/activity")
async def activity():
    db = await get_db()
    try:
        rows = await db.fetch_all("SELECT * FROM player_activity WHERE last_active > datetime('now', '-24 hours') ORDER BY last_active DESC LIMIT 100")
        return [{"player_id": r["player_id"], "character_name": r["character_name"],
                 "region": r["region"], "sub_region": r["sub_region"],
                 "coordinates": json.loads(r.get("coordinates", "{}")),
                 "world_day": r["world_day"], "last_active": r["last_active"]} for r in rows]
    finally:
        await db.close()


@router.get("/chronicle")
async def chronicle(day: int | None = None, region: str | None = None, limit: int = 20):
    db = await get_db()
    try:
        sql = "SELECT * FROM world_chronicle WHERE 1=1"
        params: list = []
        if day: sql += " AND world_day=?"; params.append(day)
        if region: sql += " AND region=?"; params.append(region)
        sql += " ORDER BY world_day DESC, created_at DESC LIMIT ?"; params.append(limit)
        rows = await db.fetch_all(sql, tuple(params))
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/npcs")
async def npcs(region: str | None = None, promoted: bool | None = None, limit: int = 50):
    db = await get_db()
    try:
        sql = "SELECT * FROM npc_registry WHERE 1=1"
        params: list = []
        if region: sql += " AND region=?"; params.append(region)
        if promoted: sql += " AND promoted=1"
        sql += " ORDER BY promoted DESC, updated_at DESC LIMIT ?"; params.append(limit)
        rows = await db.fetch_all(sql, tuple(params))
        result = []
        for r in rows:
            total = await db.fetch_one("SELECT SUM(interaction_count) as c FROM npc_relationships WHERE npc_id=?", (r["id"],))
            result.append({"npcId": r["id"], "name": r["name"], "region": r["region"],
                "source": r["source"], "promoted": bool(r["promoted"]),
                "total_interactions": total["c"] if total and total["c"] else 0})
        return result
    finally:
        await db.close()


@router.get("/timeline")
async def timeline():
    db = await get_db()
    try:
        wd = await db.fetch_one("SELECT value FROM world_meta WHERE key='world_day'")
        sb_raw = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
        sb = json.loads(sb_raw["value"]) if sb_raw else {}
        beats = sb.get("main_quest", {}).get("beats", [])
        milestones = await db.fetch_all("SELECT * FROM milestones")
        ms_map = {m["id"]: dict(m) for m in milestones}
        return {"world_day": int(wd["value"]) if wd else 1,
            "current_chapter": sb.get("main_quest", {}).get("current_chapter", {}).get("name", ""),
            "beats": [{"id": b.get("id",""), "name": b.get("name",""),
                "status": ms_map.get(b.get("id",""), {}).get("status", b.get("status","locked"))} for b in beats]}
    finally:
        await db.close()


@router.get("/events")
async def events(region: str | None = None, level: str | None = None, status: str | None = None, limit: int = 200):
    db = await get_db()
    try:
        sql = "SELECT * FROM event_templates WHERE 1=1"
        params: list = []
        if region: sql += " AND region=?"; params.append(region)
        if level: sql += " AND level=?"; params.append(level)
        if status: sql += " AND status=?"; params.append(status)
        sql += " ORDER BY CASE level WHEN 'Major' THEN 1 WHEN 'Late' THEN 2 WHEN 'Mid' THEN 3 WHEN 'Early' THEN 4 ELSE 5 END LIMIT ?"
        params.append(limit)
        rows = await db.fetch_all(sql, tuple(params))
        result = []
        for r in rows:
            inst = await db.fetch_one("SELECT * FROM event_instances WHERE template_id=? ORDER BY started_at DESC LIMIT 1", (r["id"],))
            result.append({"template_id": r["id"], "name": r["name"], "level": r["level"],
                "region": r["region"], "description": r["description"], "status": r["status"],
                "instance": {"id": inst["id"], "discovered_by": inst["discovered_by"],
                    "status": inst["status"], "progress": inst["progress_narrative"],
                    "completed_at": inst["completed_at"], "participants": inst["participants"]} if inst else None,
                "impact": r["impact_on_main"]})
        return result
    finally:
        await db.close()


@router.get("/waters")
async def waters():
    db = await get_db()
    try:
        return await get_waters(db)
    finally:
        await db.close()


@router.get("/roads")
async def roads():
    db = await get_db()
    try:
        return await get_roads(db)
    finally:
        await db.close()


@router.get("/realtime-players")
async def realtime_players(region: str | None = None):
    db = await get_db()
    try:
        params: list = []
        sql = """SELECT player_id, character_name, region, sub_region,
                        coordinates, world_day, current_action, status,
                        last_heartbeat, started_at
                 FROM player_realtime_sessions
                 WHERE is_online = 1
                   AND last_heartbeat > datetime('now', '-90 seconds')"""
        if region:
            sql += " AND region = ?"
            params.append(region)
        sql += " ORDER BY last_heartbeat DESC LIMIT 100"
        rows = await db.fetch_all(sql, tuple(params) if params else ())
        return {
            "players": [{
                "player_id": r["player_id"],
                "character_name": r["character_name"],
                "region": r["region"],
                "sub_region": r.get("sub_region", ""),
                "coordinates": json.loads(r.get("coordinates", "{}") or "{}"),
                "world_day": r.get("world_day", 1),
                "current_action": r.get("current_action", ""),
                "status": r.get("status", "idle"),
                "last_heartbeat": r.get("last_heartbeat", ""),
                "started_at": r.get("started_at", ""),
            } for r in rows]
        }
    finally:
        await db.close()


@router.get("/map-entities")
async def map_entities():
    """统一地图实体端点：返回在线玩家 + 未来可扩展 NPC 等实体"""
    db = await get_db()
    try:
        entities = []

        # 在线实时玩家
        players = await db.fetch_all(
            """SELECT player_id, character_name, region, sub_region,
                      coordinates, current_action, status, last_heartbeat
               FROM player_realtime_sessions
               WHERE is_online = 1
                 AND last_heartbeat > datetime('now', '-90 seconds')
               ORDER BY last_heartbeat DESC LIMIT 100"""
        )
        for r in players:
            coord = json.loads(r.get("coordinates", "{}") or "{}")
            entities.append({
                "entity_type": "player",
                "entity_id": r["player_id"],
                "display_name": r["character_name"] or r["player_id"],
                "region": r["region"],
                "sub_region": r.get("sub_region", ""),
                "x": coord.get("x", 0),
                "y": coord.get("y", 0),
                "z": coord.get("z", 0),
                "current_action": r.get("current_action", ""),
                "status": r.get("status", "idle"),
                "last_heartbeat": r.get("last_heartbeat", ""),
            })

        # 未来可在此添加 NPC / 事件点等
        # npcs = await db.fetch_all(...)
        # for r in npcs:
        #     entities.append({"entity_type": "npc", ...})

        return {"entities": entities, "total": len(entities)}
    finally:
        await db.close()
