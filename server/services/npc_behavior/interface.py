"""NPC 行为抽象接口"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NPCContext:
    npc_id: str
    npc_name: str
    npc_title: str
    region: str
    sub_region: str
    coordinates: dict = field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})
    npc_data: dict = field(default_factory=dict)
    world_day: int = 1
    world_time: str = "afternoon"
    weather: str = "晴朗"
    nearby_players: list = field(default_factory=list)
    recent_events: list = field(default_factory=list)
    last_action: str = ""
    last_action_time: str = ""


@dataclass
class NPCBehaviorResult:
    action_summary: str = ""
    action_type: str = "idle"
    new_region: str = ""
    new_sub_region: str = ""
    new_coordinates: Optional[dict] = None
    narrative_flavor: str = ""


class INPCBehavior(ABC):
    behavior_type: str = "rule"

    @abstractmethod
    async def tick(self, ctx: NPCContext) -> NPCBehaviorResult: ...

    @abstractmethod
    def can_move(self, ctx: NPCContext) -> bool: ...


class RuleFSMBehavior(INPCBehavior):
    """规则状态机基类"""
    behavior_type = "rule"

    def __init__(self, npc_role: str = "merchant"):
        self.npc_role = npc_role
        self._state = "idle"

    @property
    def state(self) -> str:
        return self._state

    def can_move(self, ctx: NPCContext) -> bool:
        role_config = ctx.npc_data.get("behavior_config", {})
        return role_config.get("can_travel", False)

    def _get_time_period(self) -> str:
        """从 world_time 简化为时间段"""
        wt = self._state if isinstance(self._state, str) and self._state in (
            "morning", "afternoon", "evening", "night"
        ) else "afternoon"
        return wt

    def _build_action(
        self, template: dict, location: str, region: str = ""
    ) -> NPCBehaviorResult:
        summary = template["summary"].format(location=location, region=region)
        return NPCBehaviorResult(
            action_summary=summary,
            action_type=template["type"],
            new_region=region or "",
            new_sub_region=location if not region else "",
        )

    async def tick(self, ctx: NPCContext) -> NPCBehaviorResult:
        raise NotImplementedError
