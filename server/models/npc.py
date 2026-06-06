"""NPC 模型"""
from pydantic import BaseModel
from typing import Any


class NPCRegisterRequest(BaseModel):
    name: str
    title: str = ""
    region: str
    subRegion: str = ""
    appearance: str = ""
    background: str = ""
    personality: str = ""
    motivation: str = ""
    attributes: dict = {}
    skills: list[dict] = []
    isHostile: bool = False
    canBeRecruited: bool = False
    canGrow: bool = False
    source: str = "client_created"
    faction: str = ""
    secrets: list[str] = []


class NPCRelationshipUpdate(BaseModel):
    attitude: int | None = None
    level: str | None = None
    firstMet: str | None = None
    interactionCount: int | None = None
    history: list[str] | None = None
    playerKnowsAbout: list[str] | None = None


class NPCResponse(BaseModel):
    npcId: str
    name: str
    title: str = ""
    region: str
    subRegion: str = ""
    appearance: str = ""
    background: str = ""
    personality: str = ""
    motivation: str = ""
    attributes: dict = {}
    skills: list[dict] = []
    isHostile: bool = False
    canBeRecruited: bool = False
    canGrow: bool = False
    source: str = ""
    faction: str = ""
    secrets: list[str] = []
    isMet: bool = False
    relationship: dict | None = None
