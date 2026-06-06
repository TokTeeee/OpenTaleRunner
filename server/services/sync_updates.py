from datetime import datetime, timezone

from models.world import SyncUpdatesResponse
from repositories.world_repo import IWorldRepo
from repositories.chronicle_repo import IChronicleRepo
from repositories.encounter_repo import IEncounterRepo
from services.ghost_manager import GhostManager


async def _collect_region_ids(world_repo: IWorldRepo, region_id: str | None = None) -> list[str]:
    if region_id:
        return [region_id]

    storybook = await world_repo.get_storybook() or {}
    region_ids: list[str] = []
    for region in storybook.get("regions", []):
        rid = region.get("id")
        if rid and rid not in region_ids:
            region_ids.append(rid)
    return region_ids


async def build_sync_updates(
    player_id: str,
    world_repo: IWorldRepo,
    chron_repo: IChronicleRepo,
    enc_repo: IEncounterRepo,
    ghost: GhostManager,
    region_id: str | None = None,
) -> SyncUpdatesResponse:
    world_day = await world_repo.get_world_day()
    chronicle = await chron_repo.get_latest_world_chronicle(limit=10)
    encounters = await enc_repo.get_pending(player_id) if player_id else []

    region_states: dict[str, dict] = {}
    ghost_npcs: list[dict] = []
    seen_ghost_ids: set[str] = set()

    for rid in await _collect_region_ids(world_repo, region_id):
        state = await world_repo.get_region_state(rid)
        if state:
            region_states[rid] = state

        ghosts = await ghost.get_region_ghosts(rid)
        for ghost_npc in ghosts:
            ghost_id = ghost_npc.get("npcId", "")
            if ghost_id and ghost_id in seen_ghost_ids:
                continue
            if ghost_id:
                seen_ghost_ids.add(ghost_id)
            ghost_npcs.append(ghost_npc)

    return SyncUpdatesResponse(
        worldDay=world_day,
        regionStates=region_states,
        chronicle=chronicle,
        newEncounters=encounters,
        ghostNPCs=ghost_npcs,
        lastSyncTime=datetime.now(timezone.utc).isoformat(),
    )