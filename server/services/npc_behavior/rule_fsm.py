"""规则状态机实现：基于 behavior_config 驱动的通用行为引擎"""
import random
from .interface import RuleFSMBehavior, NPCContext, NPCBehaviorResult


class ConfigurableBehavior(RuleFSMBehavior):
    """通用行为引擎 — 从 NPC 的 behavior_config 读取行为描述"""

    def __init__(self, npc_role: str = "civilian"):
        super().__init__(npc_role)
        self._state = "idle"

    async def tick(self, ctx: NPCContext) -> NPCBehaviorResult:
        bc = ctx.npc_data.get("behavior_config", {})
        schedule = bc.get("schedule", "diurnal")
        period = ctx.world_time

        if schedule == "diurnal" and period == "night":
            self._state = "resting"
            return self._build_action(
                {"summary": self._get_action(bc, "night") or "正在休息", "type": "idle"},
                ctx.sub_region
            )

        action = self._get_action(bc, period) or self._get_action(bc, "morning") or "忙碌日常事务"
        return self._build_action(
            {"summary": action, "type": "idle" if "休" in action or "睡" in action else "explore"},
            ctx.sub_region
        )

    def _get_action(self, bc: dict, period: str) -> str | None:
        actions = bc.get("actions", {})
        return actions.get(period)

    def can_move(self, ctx: NPCContext) -> bool:
        return ctx.npc_data.get("behavior_config", {}).get("can_travel", False)


class MerchantBehavior(ConfigurableBehavior):
    """商人: 基于 behavior_config 营业模式 — 保留作为特定角色的命名别名"""


class GuardBehavior(ConfigurableBehavior):
    """守卫: 基于 behavior_config 巡逻模式"""


class VillagerBehavior(ConfigurableBehavior):
    """已废弃 — 请使用 CivilianBehavior。保留用于向后兼容。"""


class CivilianBehavior(ConfigurableBehavior):
    """普通市民/村民：基于 behavior_config 的日常模式"""


FACTORY: dict[str, type] = {
    "merchant": MerchantBehavior,
    "guard": GuardBehavior,
    "villager": CivilianBehavior,
    "civilian": CivilianBehavior,
    "healer": ConfigurableBehavior,
    "scholar": ConfigurableBehavior,
    "hunter": GuardBehavior,
    "blacksmith": MerchantBehavior,
}


def create_rule_behavior(npc_role: str) -> RuleFSMBehavior:
    cls = FACTORY.get(npc_role, CivilianBehavior)
    return cls(npc_role)
