"""NPC 调度器 P1 修复测试

回归:
- 之前 get_behavior(npc_data, ...) 引用未定义变量, 每次 tick 抛 NameError
- 修复后: 使用 ctx.npc_data (已由 _build_context 解析), 正常调度
- 附加: 收紧异常处理, 至少打印 traceback
"""
import asyncio
import sys
import os
from unittest.mock import AsyncMock, MagicMock

# 让 pytest 能从 service 根目录导入包
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.npc_behavior.scheduler import NPCBehaviorScheduler
from services.npc_behavior.interface import NPCContext, NPCBehaviorResult


def _make_db_mock(npcs: list, active_regions: list[str] | None = None):
    """构造最小可用的 db 替身"""
    db = MagicMock()
    regions = active_regions if active_regions is not None else (["royal_plains"] if npcs else [])

    async def _fetch_all(sql, params=None):
        s = sql.strip().lower()
        if "distinct region from player_activity" in s:
            return [{"region": r} for r in regions]
        if "from npc_registry" in s:
            return npcs
        if "from player_activity where region=" in s:
            return []
        return []

    db.fetch_all = AsyncMock(side_effect=_fetch_all)

    async def _execute(*args, **kwargs):
        pass

    db.execute = AsyncMock(side_effect=_execute)
    return db


def _make_npc(npc_id: str = "npc-001", behavior_type: str = "rule", role: str = "merchant") -> dict:
    return {
        "id": npc_id,
        "name": "测试商人",
        "region": "royal_plains",
        "data": json_dumps({
            "behavior_type": behavior_type,
            "behavior_config": {"home_sub_region": "market", "actions": {}},
            "current_coordinates": {"x": 0, "y": 0, "z": 0},
        }),
    }


def json_dumps(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False)


def test_tick_all_uses_ctx_npc_data_not_undefined(monkeypatch):
    """回归: 修复前传未定义变量 npc_data, 修复后传 ctx.npc_data"""

    npc = _make_npc()
    db = _make_db_mock([npc], active_regions=["royal_plains"])
    sched = NPCBehaviorScheduler(db)

    # 替换 get_behavior 以观察入参
    captured = {}

    def fake_get_behavior(npc_data_arg, npc_id=""):
        captured["npc_data"] = npc_data_arg
        captured["npc_id"] = npc_id
        # 返回一个最简单的 stub behavior
        b = AsyncMock()
        b.tick = AsyncMock(return_value=NPCBehaviorResult(
            action_summary="test",
            action_type="idle",
        ))
        return b

    monkeypatch.setattr(sched, "get_behavior", fake_get_behavior)

    # 运行, 不应抛 NameError
    results = asyncio.run(sched.tick_all())

    assert len(results) == 1
    # 关键断言: 传入的 npc_data 应该是 dict 且含 behavior_type
    assert isinstance(captured.get("npc_data"), dict)
    assert captured["npc_data"].get("behavior_type") == "rule"
    assert captured["npc_id"] == "npc-001"


def test_tick_all_prints_traceback_on_failure(monkeypatch, capsys):
    """收紧异常处理: 至少打印 traceback"""

    npc = _make_npc()
    db = _make_db_mock([npc], active_regions=["royal_plains"])
    sched = NPCBehaviorScheduler(db)

    def boom(npc_data, npc_id=""):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(sched, "get_behavior", boom)

    # 不应抛到外层
    results = asyncio.run(sched.tick_all())

    assert results == []  # 单个 NPC 失败被吞掉, 但应打印 traceback
    captured = capsys.readouterr()
    assert "simulated failure" in captured.out or "simulated failure" in captured.err
    assert "Traceback" in captured.out or "Traceback" in captured.err


def test_tick_all_returns_empty_when_no_active_regions():
    """无在线玩家 → 直接返回 []"""
    db = _make_db_mock([], active_regions=[])
    sched = NPCBehaviorScheduler(db)
    results = asyncio.run(sched.tick_all())
    assert results == []
