"""奇遇路由"""
from fastapi import APIRouter, Depends
from repositories.encounter_repo import IEncounterRepo
from routers.deps import get_encounter_repo, get_current_player

router = APIRouter(prefix="/api/v1/encounters", tags=["encounters"])


@router.get("/pending")
async def get_pending(player_id=Depends(get_current_player), repo=Depends(get_encounter_repo)):
    return await repo.get_pending(player_id)


@router.post("/{enc_id}/resolve")
async def resolve(enc_id: str, repo=Depends(get_encounter_repo)):
    await repo.resolve(enc_id)
    return {"ok": True}
