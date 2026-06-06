"""角色管理路由"""
from fastapi import APIRouter, Depends, HTTPException
from models.character import CharacterCreate
from repositories.character_repo import ICharacterRepo
from routers.deps import get_character_repo, get_current_player

router = APIRouter(prefix="/api/v1/characters", tags=["characters"])


@router.post("/create")
async def create_character(req: CharacterCreate, player_id=Depends(get_current_player), repo=Depends(get_character_repo)):
    data = req.data
    data["playerId"] = player_id
    cid = await repo.create(player_id, data)
    return {"characterId": cid}


@router.get("/{char_id}")
async def get_character(char_id: str, repo=Depends(get_character_repo)):
    char = await repo.get(char_id)
    if not char:
        raise HTTPException(404, "Character not found")
    return char


@router.patch("/{char_id}")
async def update_character(char_id: str, data: dict, repo=Depends(get_character_repo)):
    await repo.update(char_id, data)
    return {"ok": True}


@router.get("/{char_id}/history")
async def get_history(char_id: str, repo=Depends(get_character_repo)):
    return await repo.get_history(char_id)
