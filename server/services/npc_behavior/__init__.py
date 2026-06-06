"""NPC 行为引擎包"""
from .interface import (
    NPCContext,
    NPCBehaviorResult,
    INPCBehavior,
    RuleFSMBehavior,
)
from .rule_fsm import (
    ConfigurableBehavior,
    CivilianBehavior,
    MerchantBehavior,
    GuardBehavior,
    create_rule_behavior,
)
from .scheduler import NPCBehaviorScheduler
