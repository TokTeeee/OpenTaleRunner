"""AI NPC 行为调度器"""
import json
import asyncio
from datetime import datetime, timezone
from db.database import Database
from .interface import NPCContext, NPCBehaviorResult, INPCBehavior, RuleFSMBehavior
from .rule_fsm import create_rule_behavior


class NPCBehaviorScheduler:
    def __init__(self, db: Database, tick_interval: int = 300):
        self.db = db
        self.tick_interval = tick_interval
        self._behaviors: dict[str, INPCBehavior] = {}
        self._running = False
        self._task: asyncio.Task | None = None

    def get_behavior(self, npc_data: dict, npc_id: str = "") -> INPCBehavior:
        if npc_id in self._behaviors:
            return self._behaviors[npc_id]

        behavior_type = npc_data.get("behavior_type", "rule")
        if behavior_type == "llm":
            from .llm_behavior import LLMBehavior
            behavior = LLMBehavior()
            behavior.init_from_npc(npc_id, npc_data, self.db)
        else:
            behavior = create_rule_behavior(npc_data.get("npc_role", "merchant"))

        self._behaviors[npc_id or npc_data.get("id", "")] = behavior
        return behavior

    async def _get_active_regions(self) -> list[str]:
        rows = await self.db.fetch_all(
            "SELECT DISTINCT region FROM player_activity WHERE is_online=1"
        )
        return [r["region"] for r in rows]

    async def _get_ai_npcs(self, regions: list[str]) -> list[dict]:
        if not regions:
            return []
        placeholders = ",".join(["?"] * len(regions))
        return await self.db.fetch_all(
            f"SELECT * FROM npc_registry WHERE region IN ({placeholders}) AND source='ai_npc'",
            tuple(regions),
        )

    async def _build_context(self, npc: dict) -> NPCContext:
        npc_data = json.loads(npc.get("data", "{}"))
        behavior_config = npc_data.get("behavior_config", {})

        region = npc.get("region", "")
        sub_region = behavior_config.get("home_sub_region", "")

        nearby = await self.db.fetch_all(
            "SELECT player_id, entity_type, character_name, current_action "
            "FROM player_activity WHERE region=? AND is_online=1 LIMIT 10",
            (region,),
        )

        existing_coords = {}
        try:
            existing_coords = json.loads(npc_data.get("current_coordinates", "{}"))
        except Exception:
            pass

        hour = datetime.now(timezone.utc).hour
        if 5 <= hour < 12:
            world_time = "morning"
        elif 12 <= hour < 17:
            world_time = "afternoon"
        elif 17 <= hour < 21:
            world_time = "evening"
        else:
            world_time = "night"

        return NPCContext(
            npc_id=npc["id"],
            npc_name=npc.get("name", ""),
            npc_title=npc_data.get("title", ""),
            region=region,
            sub_region=sub_region,
            coordinates=existing_coords,
            npc_data=npc_data,
            world_day=npc_data.get("world_day", 1),
            world_time=world_time,
            weather="晴朗",
            nearby_players=[
                {
                    "entityId": p["player_id"],
                    "entityType": p.get("entity_type", "player"),
                    "entityName": p["character_name"],
                    "currentAction": p.get("current_action", ""),
                }
                for p in nearby
            ],
            last_action=npc_data.get("last_action", ""),
        )

    async def _update_activity(self, npc: dict, result: NPCBehaviorResult):
        npc_data = json.loads(npc.get("data", "{}"))

        coords = result.new_coordinates or npc_data.get(
            "current_coordinates", {"x": 0, "y": 0, "z": 0}
        )
        sub = result.new_sub_region or npc_data.get(
            "behavior_config", {}
        ).get("home_sub_region", "")
        region = result.new_region or npc.get("region", "")

        now = datetime.now(timezone.utc).isoformat()

        await self.db.execute(
            """INSERT INTO player_activity
               (player_id, entity_type, character_name, current_action, action_type,
                action_started_at, region, sub_region, coordinates, world_day, is_online,
                status_data, last_active)
               VALUES (?, 'ai_npc', ?, ?, ?, ?, ?, ?, ?, ?, 1, '{}', ?)
               ON CONFLICT(player_id) DO UPDATE SET
               entity_type='ai_npc',
               character_name=excluded.character_name,
               current_action=excluded.current_action,
               action_type=excluded.action_type,
               action_started_at=excluded.action_started_at,
               region=excluded.region,
               sub_region=excluded.sub_region,
               coordinates=excluded.coordinates,
               world_day=excluded.world_day,
               is_online=1,
               last_active=excluded.last_active""",
            (
                npc["id"],
                npc.get("name", ""),
                result.action_summary,
                result.action_type,
                now,
                region,
                sub,
                json.dumps(coords, ensure_ascii=False),
                npc_data.get("world_day", 1),
                now,
            ),
        )

    async def tick_all(self) -> list[NPCBehaviorResult]:
        active_regions = await self._get_active_regions()
        if not active_regions:
            return []

        npcs = await self._get_ai_npcs(active_regions)
        if not npcs:
            return []

        results = []
        for npc in npcs:
            try:
                ctx = await self._build_context(npc)
                # 修复: 之前传未定义变量 npc_data, 导致每次 tick 都抛 NameError 并被裸 except 静默吞掉
                # ctx.npc_data 已包含解析后的 npc 配置, 正好是 get_behavior 需要的入参
                behavior = self.get_behavior(ctx.npc_data, npc["id"])
                result = await behavior.tick(ctx)
                await self._update_activity(npc, result)
                results.append(result)
            except Exception as e:
                # 收紧: 至少记录 traceback 便于排查(原代码仅 print 一行)
                import traceback
                print(f"[NPC Scheduler] tick failed for {npc.get('name', '?')}: {e}")
                traceback.print_exc()

        return results

    async def _loop(self):
        while self._running:
            try:
                await self.tick_all()
            except Exception as e:
                print(f"[NPC Scheduler] loop error: {e}")
            await asyncio.sleep(self.tick_interval)

    def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
