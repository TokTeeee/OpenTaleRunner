"""事件 API"""
import json, uuid
from fastapi import APIRouter, Depends, HTTPException
from db.database import SqliteDatabase
from routers.deps import get_db, get_current_player
from logging_config import api_log

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.get("/available")
async def available_events(
    region: str = "",
    player_id: str = Depends(get_current_player),
    db=Depends(get_db),
):
    """返回玩家在当前条件下可触发的事件模板"""
    # 获取玩家已完成的实例
    completed = await db.fetch_all(
        "SELECT template_id FROM event_instances WHERE discovered_by=? AND status='completed'", (player_id,))
    completed_ids = {r["template_id"] for r in completed}

    # 查询可用事件
    rows = await db.fetch_all(
        "SELECT * FROM event_templates WHERE status!='locked' AND (region=? OR region='') AND id NOT IN ({}) ORDER BY level, name LIMIT 20"
        .format(",".join("?" * len(completed_ids)) if completed_ids else "''"),
        tuple([region] + list(completed_ids)) if completed_ids else (region,)
    )

    result = []
    for r in rows:
        inst = await db.fetch_one("SELECT * FROM event_instances WHERE template_id=? ORDER BY started_at DESC LIMIT 1", (r["id"],))
        result.append({
            "template_id": r["id"], "name": r["name"], "level": r["level"],
            "region": r["region"], "description": r["description"],
            "template_narrative": r["template_narrative"],
            "is_claimed": inst is not None,
            "instance": {
                "id": inst["id"], "discovered_by": inst["discovered_by"],
                "status": inst["status"], "progress": inst["progress_narrative"],
            } if inst else None,
        })
    return result


@router.post("/{event_id}/trigger")
async def trigger_event(
    event_id: str,
    body: dict,
    player_id: str = Depends(get_current_player),
    db=Depends(get_db),
):
    """玩家触发事件。如果已被他人触发，返回已有实例信息"""
    template = await db.fetch_one("SELECT * FROM event_templates WHERE id=?", (event_id,))
    if not template:
        raise HTTPException(404, "Event template not found")

    existing = await db.fetch_one("SELECT * FROM event_instances WHERE template_id=?", (event_id,))
    if existing:
        # 已有人触发 — 加入为参与者
        participants = json.loads(existing.get("participants", "[]"))
        if player_id not in participants:
            participants.append(player_id)
        await db.execute(
            "UPDATE event_instances SET participants=? WHERE id=?",
            (json.dumps(participants), existing["id"]))
        return {
            "instance_id": existing["id"],
            "claimed": True,
            "discovered_by": existing["discovered_by"],
            "status": existing["status"],
            "message": "此事件已在进行中，你可以从另一视角参与",
        }

    # 首次触发
    plan = body.get("plan_description", "")
    inst_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO event_instances (id,template_id,discovered_by,status,plan_description,participants) VALUES (?,?,?,?,?,?)",
        (inst_id, event_id, player_id, "discovered", plan, json.dumps([player_id])))
    api_log.info(f"Event triggered: {event_id} by {player_id}")
    return {"instance_id": inst_id, "claimed": False, "discovered_by": player_id, "status": "discovered"}


@router.post("/{event_id}/progress")
async def update_progress(
    event_id: str,
    body: dict,
    player_id: str = Depends(get_current_player),
    db=Depends(get_db),
):
    """更新事件进展"""
    instance = await db.fetch_one("SELECT * FROM event_instances WHERE template_id=?", (event_id,))
    if not instance:
        raise HTTPException(404, "Event instance not found")

    status = body.get("status", instance["status"])
    progress = body.get("progress_narrative", instance["progress_narrative"])
    narrative = body.get("actual_narrative", instance["actual_narrative"])
    completed = body.get("completed", False)

    await db.execute(
        "UPDATE event_instances SET status=?, progress_narrative=?, actual_narrative=?, completed_at=? WHERE id=?",
        (status, progress, narrative, "datetime('now')" if completed else instance["completed_at"], instance["id"]))

    if completed:
        await db.execute("UPDATE event_templates SET status='completed' WHERE id=?", (event_id,))

    api_log.info(f"Event progress: {event_id} → {status}")
    return {"ok": True}
