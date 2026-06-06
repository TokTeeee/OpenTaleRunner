"""角色模型"""
from pydantic import BaseModel
from typing import Any


class HistoryEntry(BaseModel):
    worldDay: int
    region: str
    summary: str


class CharacterResponse(BaseModel):
    characterId: str
    playerId: str
    name: str
    race: str = "人类"
    background: str
    appearance: str = ""
    attributes: dict
    skills: list[dict]
    inventory: dict
    status: dict
    joinedRegion: str
    joinedWorldDay: int = 1
    currentLocalDay: int = 1
    recentHistory: list[HistoryEntry] = []


class CharacterCreate(BaseModel):
    data: dict  # JSON blob, validated by client
