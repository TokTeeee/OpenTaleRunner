"""多人联机路由 — 房间管理 / 行动轮 / 存档"""

from fastapi import APIRouter, Depends, HTTPException
from models.multiplayer import (
    CreateRoomRequest, JoinRoomRequest, ClaimSlotRequest,
    CharacterReadyRequest, StartGameRequest, SubmitActionRequest,
    RoomResponse, RoundStatusResponse, RoundProcessResponse,
    SaveResponse, CommonBackstoryResponse, NarrativeHistoryResponse,
    RoomNotificationsResponse,
)
from services.multiplayer_service import MultiplayerService, RoomError
from routers.deps import get_current_player

router = APIRouter(prefix="/api/v1/multiplayer", tags=["multiplayer"])


# ─── 依赖注入 ───

_mp_service: MultiplayerService | None = None


async def get_mp_service() -> MultiplayerService:
    global _mp_service
    if _mp_service is None:
        from routers.deps import get_db
        from repositories.multiplayer_repo import SqliteMultiplayerRepo
        db = await get_db()
        repo = SqliteMultiplayerRepo(db)
        _mp_service = MultiplayerService(repo)
    return _mp_service


def _room_to_response(room) -> dict:
    return {
        "room_id": room.room_id,
        "host_player_id": room.host_player_id,
        "config": room.config.model_dump(),
        "mode": room.mode,
        "created_at": room.created_at,
        "started_at": room.started_at,
        "state": room.state.model_dump(),
        "players": [p.model_dump() for p in room.players],
        "character_slots": [s.model_dump() for s in room.character_slots],
        "room_notifications": room.room_notifications,
    }


# ─── 房间管理 ───

@router.post("/rooms")
async def create_room(
    req: CreateRoomRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        room = await service.create_room(
            host_id=player_id,
            config=req.config,
            mode=req.mode,
            inherit_data=req.inherit_data,
            player_name=player_id,  # TODO: 从认证信息获取用户名
        )
        return _room_to_response(room)
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.get("/rooms/{room_id}")
async def get_room(
    room_id: str,
    service: MultiplayerService = Depends(get_mp_service),
):
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(404, "房间不存在")
    return _room_to_response(room)


@router.post("/rooms/{room_id}/join")
async def join_room(
    room_id: str,
    req: JoinRoomRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        room = await service.join_room(
            room_id=room_id,
            player_id=player_id,
            player_name=player_id,
            password=req.password,
            claimed_slot_id=req.claimed_slot_id,
        )
        return _room_to_response(room)
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.post("/rooms/{room_id}/leave")
async def leave_room(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        await service.leave_room(room_id, player_id)
        return {"message": "已离开房间"}
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.post("/rooms/{room_id}/heartbeat")
async def heartbeat(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        await service.heartbeat(room_id, player_id)
        return {"is_online": True, "message": "ok"}
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 角色槽 ───

@router.post("/rooms/{room_id}/claim-slot")
async def claim_slot(
    room_id: str,
    req: ClaimSlotRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        await service.claim_slot(room_id, req.slot_id, player_id)
        return {"slot_id": req.slot_id, "claimed_by_player_id": player_id, "message": "角色认领成功"}
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.post("/rooms/{room_id}/release-slot")
async def release_slot(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.release_slot(room_id, player_id)
        return {"slot_id": result, "message": "角色已释放"}
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 角色就绪 ───

@router.post("/rooms/{room_id}/character-ready")
async def character_ready(
    room_id: str,
    req: CharacterReadyRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        await service.mark_character_ready(
            room_id=room_id,
            player_id=player_id,
            character_id=req.character_id,
            character_name=req.character_name,
            character_data=req.character_data,
            character_background=req.character_background,
        )
        return {"is_ready": True, "message": "已就绪"}
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 共同背景故事 ───

@router.post("/rooms/{room_id}/generate-common-backstory")
async def generate_common_backstory(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.generate_common_backstory(room_id, player_id)
        return result.model_dump()
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 开始游戏 ───

@router.post("/rooms/{room_id}/start")
async def start_game(
    room_id: str,
    req: StartGameRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        room = await service.start_game(room_id, player_id)
        return _room_to_response(room)
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 观战相关 ───

@router.post("/rooms/{room_id}/spectator-ready")
async def spectator_ready(
    room_id: str,
    req: CharacterReadyRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.spectator_ready(
            room_id, player_id,
            req.character_id, req.character_name,
            req.character_data, req.character_background,
        )
        return result
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.get("/rooms/{room_id}/notifications")
async def get_room_notifications(
    room_id: str,
    since_round: int = -1,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    room = await service.get_room(room_id)
    if not room:
        raise HTTPException(404, "房间不存在")
    notes = room.room_notifications
    if since_round >= 0:
        notes = [n for n in notes if n.get("round", 0) > since_round]
    return {"notifications": notes}


# ─── 存档 ───

@router.post("/rooms/{room_id}/save")
async def save_game(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        room = await service.get_room(room_id)
        if not room:
            raise HTTPException(404, "房间不存在")
        if room.host_player_id != player_id:
            raise HTTPException(403, "仅房主可以保存存档")

        data = await service.build_save_data(room_id)
        return data.model_dump()
    except RoomError as e:
        raise HTTPException(400, str(e))


# ─── 行动轮 ───

@router.post("/rooms/{room_id}/action")
async def submit_action(
    room_id: str,
    req: SubmitActionRequest,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.submit_action(room_id, player_id, req.action, req.dice_result)
        return result
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.post("/rooms/{room_id}/action-skip")
async def skip_action(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.skip_round(room_id, player_id)
        return result
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.get("/rooms/{room_id}/round-status")
async def get_round_status(
    room_id: str,
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.get_round_status(room_id)
        return result
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.get("/rooms/{room_id}/narratives")
async def get_narratives(
    room_id: str,
    since_round: int = 0,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        narratives = await service.get_narratives(room_id, since_round, player_id)
        return {"narratives": narratives}
    except RoomError as e:
        raise HTTPException(400, str(e))


@router.post("/rooms/{room_id}/round-process")
async def process_round(
    room_id: str,
    player_id: str = Depends(get_current_player),
    service: MultiplayerService = Depends(get_mp_service),
):
    try:
        result = await service.process_round(room_id)
        return result
    except RoomError as e:
        raise HTTPException(400, str(e))
