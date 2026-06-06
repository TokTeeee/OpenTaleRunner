"""世界状态模型"""
from pydantic import BaseModel
from typing import Any


class RegionState(BaseModel):
    id: str
    name: str = ""
    description: str = ""
    terrain: str = ""
    weather: str = "晴朗"
    factions: list[dict] = []
    subRegions: list[str] = []
    currentEvents: list[str] = []


class GhostNPC(BaseModel):
    npcId: str
    playerId: str
    characterName: str
    appearance: str = ""
    personalityTags: list[str] = []
    recentActions: str = ""
    currentIntent: str = ""
    attitudeToStrangers: str = "谨慎"
    knownInfo: list[str] = []
    region: str
    expiresAt: str = ""


class Encounter(BaseModel):
    encounterId: str
    type: str
    involvedPlayers: list[str] = []
    region: str
    description: str = ""
    timestamp: str = ""
    resolved: bool = False


class SyncUpdatesResponse(BaseModel):
    worldDay: int
    regionStates: dict[str, dict] = {}
    chronicle: list[dict] = []
    newEncounters: list[dict] = []
    ghostNPCs: list[dict] = []
    lastSyncTime: str = ""


class RealtimeSessionUpload(BaseModel):
    character_name: str = ""
    region: str
    sub_region: str = ""
    coordinates: dict | None = None
    world_day: int = 1
    current_action: str = ""
    status: str = "idle"
    is_online: bool = True


class NearbyPlayer(BaseModel):
    player_id: str
    character_name: str
    region: str
    sub_region: str = ""
    coordinates: dict = {}
    current_action: str = ""
    status: str = "idle"
    world_day: int = 1
    last_heartbeat: str = ""


class NearbyPlayersResponse(BaseModel):
    nearby_players: list[dict] = []
