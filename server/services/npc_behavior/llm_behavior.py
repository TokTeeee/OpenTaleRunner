"""LLM 驱动 NPC 行为 — 独立 LLM 上下文驱动关键 NPC"""
import json, httpx
from datetime import datetime, timezone
from services.npc_behavior.interface import INPCBehavior, NPCContext, NPCBehaviorResult
from config import settings


class LLMBehavior(INPCBehavior):
    behavior_type = "llm"

    def __init__(self):
        self.memory: list[dict] = []
        self._db = None
        self._npc_id = ""

    @property
    def state(self) -> str:
        return self._state

    def can_move(self, ctx: NPCContext) -> bool:
        config = ctx.npc_data.get("behavior_config", {})
        return config.get("can_travel", False)

    def init_from_npc(self, npc_id: str, npc_data: dict, db):
        """从 NPC 持久化数据恢复 LLM 记忆"""
        self._npc_id = npc_id
        self._db = db
        promo = npc_data.get("promotion_info", {}) or {}
        self.memory = promo.get("llm_memory", []) or []

    async def tick(self, ctx: NPCContext) -> NPCBehaviorResult:
        if not settings.llm_api_key:
            return self._fallback_idle(ctx)

        prompt = self._build_prompt(ctx)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    settings.llm_endpoint,
                    headers={
                        "Authorization": f"Bearer {settings.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.llm_model,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": f"时间: 世界日{ctx.world_day} · {ctx.world_time}。请决定下一步行为。"},
                        ],
                        "temperature": settings.llm_temperature,
                        "max_tokens": 256,
                    },
                )
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                result = self._parse_response(content, ctx)
                self._record_memory(ctx, result)
                await self._persist_memory()
                return result
        except Exception:
            return self._fallback_idle(ctx)

    async def _persist_memory(self):
        """将记忆持久化到 npc_registry.data.promotion_info.llm_memory"""
        if not self._npc_id or not self._db:
            return
        try:
            from db.database import Database
            db: Database = self._db
            row = await db.fetch_one(
                "SELECT data FROM npc_registry WHERE id=?", (self._npc_id,))
            if not row: return
            data = json.loads(row["data"])
            promo = data.get("promotion_info", {}) or {}
            promo["llm_memory"] = self.memory[-20:]
            data["promotion_info"] = promo
            await db.execute(
                "UPDATE npc_registry SET data=? WHERE id=?",
                (json.dumps(data, ensure_ascii=False), self._npc_id))
        except Exception:
            pass

    def _build_prompt(self, ctx: NPCContext) -> str:
        parts = [
            f"你是{ctx.npc_name}，{ctx.npc_title or '一个NPC'}。",
            f"背景: {ctx.npc_data.get('background', ctx.npc_data.get('personality', ''))}",
            f"性格: {ctx.npc_data.get('personality', '')}",
            f"当前位置: {ctx.region} · {ctx.sub_region}",
            f"天气: {ctx.weather}",
        ]

        if ctx.nearby_players:
            names = [p.get("entityName", "") for p in ctx.nearby_players if p.get("entityName")]
            if names:
                parts.append(f"附近冒险者: {', '.join(names)}")

        if self.memory:
            recent = self.memory[-5:]
            parts.append("最近行为:")
            for m in recent:
                parts.append(f"  世界日{m['world_day']} · {m['time']}: {m['action']}")

        parts.append("""
请基于你的角色设定决定下一步做什么。输出 JSON 格式:
{
  "action_summary": "简短行为描述(20字内)",
  "action_type": "social/combat/explore/idle",
  "move_to_region": "",
  "move_to_sub_region": "",
  "narrative_flavor": "可选叙事文本"
}

规则:
- 如果你的性格是商人/店主，通常在固定地点活动
- 如果有冒险者在你附近，可以决定与他们互动或继续自己的事情
- 不要凭空创造不可能的行为
- 夜间通常休息，白天活动
""")
        return '\n'.join(parts)

    def _parse_response(self, raw: str, ctx: NPCContext) -> NPCBehaviorResult:
        try:
            text = raw.strip()
            code = text.find('{')
            if code >= 0:
                depth = 0
                end = code
                for i in range(code, len(text)):
                    if text[i] == '{': depth += 1
                    elif text[i] == '}':
                        depth -= 1
                        if depth == 0:
                            end = i + 1
                            break
                text = text[code:end]
            data = json.loads(text)
            return NPCBehaviorResult(
                action_summary=data.get("action_summary", f"{ctx.npc_name}在{ctx.sub_region}活动"),
                action_type=data.get("action_type", "idle"),
                new_region=data.get("move_to_region", ""),
                new_sub_region=data.get("move_to_sub_region", ""),
                narrative_flavor=data.get("narrative_flavor", ""),
            )
        except (json.JSONDecodeError, KeyError):
            return self._fallback_idle(ctx)

    def _fallback_idle(self, ctx: NPCContext) -> NPCBehaviorResult:
        return NPCBehaviorResult(
            action_summary=f"{ctx.npc_name}在{ctx.sub_region}活动",
            action_type="idle",
            new_region="",
            new_sub_region="",
        )

    def _record_memory(self, ctx: NPCContext, result: NPCBehaviorResult):
        self.memory.append({
            "world_day": ctx.world_day,
            "time": ctx.world_time,
            "action": result.action_summary,
        })
        if len(self.memory) > 50:
            self.memory = self.memory[-50:]
