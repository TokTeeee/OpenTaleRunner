"""角色管理路由"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from models.character import CharacterCreate
from repositories.character_repo import ICharacterRepo
from routers.deps import get_character_repo, get_current_player
from services.exp_formula import apply_exp_formula, exp_to_next, MAX_LEVEL

router = APIRouter(prefix="/api/v1/characters", tags=["characters"])


class ExpGrantRequest(BaseModel):
    amount: int
    difficulty: str = "normal"


class AttributeSpendRequest(BaseModel):
    attribute: str  # one of STR/DEX/CON/INT/WIS/CHA


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


# ---------------------------------------------------------------------------
# v0.5.1 — Level-EXP endpoints (server-authoritative)
# ---------------------------------------------------------------------------

@router.patch("/{char_id}/exp")
async def grant_exp_endpoint(
    char_id: str,
    body: ExpGrantRequest,
    repo: ICharacterRepo = Depends(get_character_repo),
    player_id: str = Depends(get_current_player),
):
    char = await repo.get(char_id)
    if not char:
        raise HTTPException(404, "Character not found")
    if char.get("playerId") != player_id:
        raise HTTPException(403, "Not your character")

    old_level = char.get("level", 1)
    new_level, new_exp = apply_exp_formula(old_level, char.get("exp", 0), body.amount, body.difficulty)
    earned_levels = max(0, new_level - old_level)
    attr_points = char.get("unspentAttributePoints", 0) + earned_levels
    patch = {
        "level": new_level,
        "exp": new_exp,
        "expToNext": exp_to_next(new_level),
        "unspentAttributePoints": attr_points,
    }
    await repo.update(char_id, {**char, **patch})
    return patch


@router.patch("/{char_id}/attributes/spend")
async def spend_attribute_point_endpoint(
    char_id: str,
    body: AttributeSpendRequest,
    repo: ICharacterRepo = Depends(get_character_repo),
    player_id: str = Depends(get_current_player),
):
    char = await repo.get(char_id)
    if not char:
        raise HTTPException(404, "Character not found")
    if char.get("playerId") != player_id:
        raise HTTPException(403, "Not your character")
    pool = char.get("unspentAttributePoints", 0)
    if pool <= 0:
        raise HTTPException(400, "no unspent attribute points")
    if body.attribute not in ("STR", "DEX", "CON", "INT", "WIS", "CHA"):
        raise HTTPException(400, "invalid attribute name")
    attrs = dict(char.get("attributes", {}))
    attrs[body.attribute] = min(20, attrs.get(body.attribute, 10) + 1)
    new_pool = pool - 1
    await repo.update(char_id, {
        **char,
        "attributes": attrs,
        "unspentAttributePoints": new_pool,
    })
    return {"attributes": attrs, "unspentAttributePoints": new_pool}
