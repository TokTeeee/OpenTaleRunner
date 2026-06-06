"""活动追踪路由"""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from db.database import Database
from models.activity import ActivityReport, ActivityRecord, ActivityLocation, ActiveEntitiesResponse
from routers.deps import get_db

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


@router.post("/report")
async def report_activity(report: ActivityReport, db: Database = Depends(get_db)):
    location_json = json.dumps({
        "region": report.location.region,
        "subRegion": report.location.subRegion,
        "coordinates": report.location.coordinates,
    }, ensure_ascii=False)

    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        """INSERT INTO player_activity
           (player_id, entity_type, character_name, current_action, action_type,
            action_started_at, region, sub_region, coordinates,
            world_day, is_online, status_data, last_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(player_id) DO UPDATE SET
           entity_type=excluded.entity_type,
           character_name=excluded.character_name,
           current_action=excluded.current_action,
           action_type=excluded.action_type,
           action_started_at=excluded.action_started_at,
           region=excluded.region,
           sub_region=excluded.sub_region,
           coordinates=excluded.coordinates,
           world_day=excluded.world_day,
           is_online=excluded.is_online,
           status_data=excluded.status_data,
           last_active=excluded.last_active""",
        (report.entityId, report.entityType, report.entityName,
         report.currentAction, report.actionType,
         now if report.currentAction else None,
         report.location.region, report.location.subRegion,
         location_json, report.worldDay,
         1 if report.isOnline else 0, '{}', now),
    )

    # Insert into activity history when there's a meaningful action
    if report.currentAction and report.actionType != 'idle':
        await db.execute(
            """INSERT INTO activity_history
               (entity_id, entity_name, action_summary, action_type, location_json, started_at, world_day)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (report.entityId, report.entityName, report.currentAction,
             report.actionType, location_json, now, report.worldDay),
        )

    return {"status": "ok", "entityId": report.entityId}


@router.get("/active", response_model=ActiveEntitiesResponse)
async def get_active_activities(
    region: str = Query(None),
    entity_type: str = Query(None, alias="entity_type"),
    is_online: bool = Query(None, alias="is_online"),
    db: Database = Depends(get_db),
):
    where = []
    params: list = []

    if region:
        where.append("region = ?")
        params.append(region)
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    if is_online is not None:
        where.append("is_online = ?")
        params.append(1 if is_online else 0)

    where_clause = " AND ".join(where) if where else "1=1"
    sql = f"SELECT * FROM player_activity WHERE {where_clause} ORDER BY last_active DESC LIMIT 100"

    rows = await db.fetch_all(sql, tuple(params))

    entities = []
    for row in rows:
        loc_raw = json.loads(row.get("coordinates", "{}"))
        coords = loc_raw.get("coordinates", {}) if isinstance(loc_raw, dict) else {}
        entities.append(ActivityRecord(
            entityId=row["player_id"],
            entityType=row.get("entity_type", "player"),
            entityName=row["character_name"],
            currentAction=row.get("current_action", ""),
            actionType=row.get("action_type", "idle"),
            location=ActivityLocation(
                region=row.get("region", ""),
                subRegion=row.get("sub_region", ""),
                coordinates=coords if isinstance(coords, dict) else {"x": 0, "y": 0, "z": 0},
            ),
            worldDay=row.get("world_day", 1),
            isOnline=bool(row.get("is_online", 0)),
            lastActive=row.get("last_active", ""),
        ))

    return ActiveEntitiesResponse(
        entities=entities,
        lastUpdated=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/heartbeat")
async def heartbeat(entity_id: str = Query(alias="entityId"), db: Database = Depends(get_db)):
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE player_activity SET is_online=1, last_active=? WHERE player_id=?",
        (now, entity_id),
    )
    return {"status": "ok"}


@router.get("/history/{entity_id}")
async def get_activity_history(
    entity_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Database = Depends(get_db),
):
    rows = await db.fetch_all(
        """SELECT * FROM activity_history
           WHERE entity_id = ?
           ORDER BY started_at DESC
           LIMIT ? OFFSET ?""",
        (entity_id, limit, offset),
    )

    total_row = await db.fetch_one(
        "SELECT COUNT(*) as cnt FROM activity_history WHERE entity_id = ?",
        (entity_id,),
    )

    history = []
    for row in rows:
        history.append({
            "action_summary": row.get("action_summary", ""),
            "action_type": row.get("action_type", "idle"),
            "location": json.loads(row.get("location_json", "{}")),
            "started_at": row.get("started_at", ""),
            "ended_at": row.get("ended_at", ""),
            "world_day": row.get("world_day", 1),
        })

    return {
        "entity_id": entity_id,
        "entity_name": row.get("entity_name", "") if rows else "",
        "history": history,
        "total": total_row["cnt"] if total_row else 0,
    }
