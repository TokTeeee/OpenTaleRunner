"""故事书路由"""
from fastapi import APIRouter, Depends
from repositories.world_repo import IWorldRepo
from services.aliases import alias_region
from routers.deps import get_world_repo

router = APIRouter(prefix="/api/v1/storybook", tags=["storybook"])

NEUTRAL_STORYBOOK = {"version": 1, "worldName": "当前世界", "world_name": "当前世界", "regions": []}


@router.get("")
async def get_storybook(repo=Depends(get_world_repo)):
    sb = await repo.get_storybook()
    return sb or NEUTRAL_STORYBOOK


@router.get("/world-lore")
async def get_world_lore(repo=Depends(get_world_repo)):
    sb = await repo.get_storybook()
    return {"worldLore": sb.get("world_lore", {}).get("geography", "") if sb else ""}


@router.get("/main-quest")
async def get_main_quest(repo=Depends(get_world_repo)):
    sb = await repo.get_storybook()
    return sb.get("main_quest", {}) if sb else {}


@router.get("/regions")
async def get_regions(repo=Depends(get_world_repo)):
    sb = await repo.get_storybook()
    regions = sb.get("regions", []) if sb else []
    for r in regions:
        r["display_name"] = alias_region(r.get("id", ""))
        r["name"] = r.get("display_name") or r.get("name", r.get("id", ""))
    return regions


@router.get("/full")
async def get_full_storybook(repo=Depends(get_world_repo)):
    sb = await repo.get_storybook()
    return sb or NEUTRAL_STORYBOOK
