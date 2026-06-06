"""NPC 路由"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from models.npc import NPCRegisterRequest, NPCRelationshipUpdate
from services.npc_service import NPCService
from routers.deps import get_npc_service, get_current_player, get_db
from db.database import Database
from services.npc_behavior.scheduler import NPCBehaviorScheduler
from services.npc_behavior.interface import NPCContext

router = APIRouter(prefix="/api/v1/npcs", tags=["npcs"])


@router.get("/known")
async def get_known_npcs(
    ids: str = Query(""),
    player_id=Depends(get_current_player),
    service=Depends(get_npc_service),
):
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return []
    return await service.get_known_npcs(id_list, player_id)


@router.get("/region/{region_id}")
async def get_region_npcs(region_id: str, service=Depends(get_npc_service)):
    return await service.get_region_npcs(region_id)


@router.post("/register")
async def register_npc(req: NPCRegisterRequest, player_id=Depends(get_current_player), service=Depends(get_npc_service)):
    nid = await service.register(req.model_dump(), player_id)
    return {"npcId": nid}


@router.patch("/{npc_id}/relationship")
async def update_relationship(npc_id: str, rel: NPCRelationshipUpdate, player_id=Depends(get_current_player), service=Depends(get_npc_service)):
    await service.update_relationship(npc_id, player_id, rel.model_dump(exclude_none=True))
    return {"ok": True}


@router.patch("/{npc_id}/behavior")
async def set_npc_behavior(npc_id: str, config: dict, db: Database = Depends(get_db)):
    npc = await db.fetch_one("SELECT * FROM npc_registry WHERE id=?", (npc_id,))
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    data["behavior_type"] = config.get("behavior_type", "rule")
    if "behavior_config" in config:
        data["behavior_config"] = config["behavior_config"]

    await db.execute("UPDATE npc_registry SET data=?, updated_at=datetime('now') WHERE id=?",
                     (json.dumps(data, ensure_ascii=False), npc_id))
    return {"ok": True, "npcId": npc_id, "behavior_type": data["behavior_type"]}


@router.get("/{npc_id}/behavior")
async def get_npc_behavior(npc_id: str, db: Database = Depends(get_db)):
    npc = await db.fetch_one("SELECT * FROM npc_registry WHERE id=?", (npc_id,))
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    activity = await db.fetch_one(
        "SELECT * FROM player_activity WHERE player_id=?", (npc_id,)
    )

    return {
        "npcId": npc_id,
        "behavior_type": data.get("behavior_type", "rule"),
        "behavior_config": data.get("behavior_config", {}),
        "current_action": activity.get("current_action", "") if activity else "",
        "last_active": activity.get("last_active", "") if activity else "",
    }


@router.post("/{npc_id}/behavior/tick")
async def tick_npc_behavior(npc_id: str, db: Database = Depends(get_db)):
    npc = await db.fetch_one("SELECT * FROM npc_registry WHERE id=?", (npc_id,))
    if not npc:
        raise HTTPException(404, "NPC not found")

    npc_data = json.loads(npc.get("data", "{}"))
    from services.npc_behavior.scheduler import NPCBehaviorScheduler
    scheduler = NPCBehaviorScheduler(db)
    ctx = await scheduler._build_context(dict(npc))
    behavior = scheduler.get_behavior(npc_data, npc_id)
    result = await behavior.tick(ctx)
    await scheduler._update_activity(dict(npc), result)

    return {
        "ok": True,
        "action_summary": result.action_summary,
        "action_type": result.action_type,
        "new_region": result.new_region,
    }


@router.patch("/{npc_id}/voice")
async def update_npc_voice(
    npc_id: str,
    body: dict,
    db: Database = Depends(get_db),
):
    """保存/更新 NPC 音色参数"""
    voice_json = json.dumps(body, ensure_ascii=False)
    npc = await db.fetch_one(
        "SELECT data FROM npc_registry WHERE npc_id = ?",
        (npc_id,),
    )
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    data["voice_params"] = body

    await db.execute(
        "UPDATE npc_registry SET data = ? WHERE npc_id = ?",
        (json.dumps(data, ensure_ascii=False), npc_id),
    )
    return {"ok": True, "npc_id": npc_id, "voice_params": body}


@router.get("/{npc_id}/voice")
async def get_npc_voice(
    npc_id: str,
    db: Database = Depends(get_db),
):
    """获取 NPC 音色参数"""
    npc = await db.fetch_one(
        "SELECT data FROM npc_registry WHERE npc_id = ?",
        (npc_id,),
    )
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    return {
        "npc_id": npc_id,
        "voice_params": data.get("voice_params"),
    }


@router.patch("/{npc_id}/portrait")
async def update_npc_portrait(
    npc_id: str,
    body: dict,
    db: Database = Depends(get_db),
):
    """保存/更新 NPC 立绘"""
    npc = await db.fetch_one(
        "SELECT data FROM npc_registry WHERE npc_id = ?",
        (npc_id,),
    )
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    data["portrait"] = {
        "url": body.get("url", ""),
        "generated_at": body.get("generated_at", ""),
        "style_version": body.get("style_version", ""),
    }

    await db.execute(
        "UPDATE npc_registry SET data = ? WHERE npc_id = ?",
        (json.dumps(data, ensure_ascii=False), npc_id),
    )
    return {"ok": True, "npc_id": npc_id}


@router.get("/{npc_id}/portrait")
async def get_npc_portrait(
    npc_id: str,
    db: Database = Depends(get_db),
):
    """获取 NPC 立绘"""
    npc = await db.fetch_one(
        "SELECT data FROM npc_registry WHERE npc_id = ?",
        (npc_id,),
    )
    if not npc:
        raise HTTPException(404, "NPC not found")

    data = json.loads(npc.get("data", "{}"))
    return {
        "npc_id": npc_id,
        "portrait": data.get("portrait"),
    }


@router.get("/{npc_id}/full")
async def get_npc_full(
    npc_id: str,
    player_id: str = Query(None),
    service: NPCService = Depends(get_npc_service),
):
    """获取 NPC 完整标准化数据（含关系、音色、立绘、升格状态）"""
    npc = await service.get_full_npc(npc_id, player_id)
    if not npc:
        raise HTTPException(404, "NPC not found")
    return npc


@router.patch("/{npc_id}")
async def patch_npc(
    npc_id: str,
    body: dict = Body(...),
    service: NPCService = Depends(get_npc_service),
):
    """客户端同步 NPC 数据到服务端（voice_params/portrait/attributes/skills/behavior_config）"""
    await service.patch_npc(npc_id, body)
    return {"ok": True, "npc_id": npc_id}
