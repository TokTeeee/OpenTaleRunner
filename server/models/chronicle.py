"""编年史模型"""
from pydantic import BaseModel
from typing import Any


class ChronicleLogEntry(BaseModel):
    entryId: str
    playerId: str
    characterName: str
    worldDay: int
    localDay: int
    location: dict
    action: dict
    narrativeOutput: str = ""
    consequences: dict = {}
    timestamp: str = ""


class ChronicleLogBatch(BaseModel):
    playerId: str
    entries: list[ChronicleLogEntry]
    lastWorldDay: int


class PushResult(BaseModel):
    uploaded: int
    failed: int
    newEncounters: list[dict] = []


class WorldChronicleEntry(BaseModel):
    id: str
    worldDay: int
    region: str
    title: str
    narrative: str
    timestamp: str = ""
