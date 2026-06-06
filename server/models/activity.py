"""活动追踪模型"""
from pydantic import BaseModel, Field
from typing import Optional


class ActivityLocation(BaseModel):
    region: str = ""
    subRegion: str = ""
    coordinates: dict = Field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})


class ActivityReport(BaseModel):
    entityId: str
    entityType: str = "player"
    entityName: str
    currentAction: str = ""
    actionType: str = "idle"
    location: ActivityLocation = Field(default_factory=ActivityLocation)
    worldDay: int = 1
    isOnline: bool = True


class ActivityRecord(BaseModel):
    entityId: str
    entityType: str
    entityName: str
    currentAction: str
    actionType: str
    location: ActivityLocation
    worldDay: int
    isOnline: bool
    lastActive: str = ""


class ActiveEntitiesResponse(BaseModel):
    entities: list[ActivityRecord] = []
    lastUpdated: str = ""
