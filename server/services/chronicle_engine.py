"""大PM — 编年史聚合引擎（服务端唯一的LLM调用）"""
import json, uuid
import httpx
from config import settings
from repositories.chronicle_repo import IChronicleRepo
from repositories.world_repo import IWorldRepo
from logging_config import chronicle_log


class ChronicleEngine:
    def __init__(self, chronicle_repo: IChronicleRepo, world_repo: IWorldRepo):
        self.chronicle_repo = chronicle_repo
        self.world_repo = world_repo

    async def aggregate_region(self, region: str, world_day: int) -> dict | None:
        logs = await self.chronicle_repo.get_recent_by_region(region, world_day)
        if len(logs) < settings.chronicle_aggregate_min_logs:
            return None
        chronicle_log.info(f"Aggregating {len(logs)} logs for {region} day {world_day}")

        summaries = []
        for log in logs:
            a = log.get("action", {})
            summaries.append(
                f"- {log.get('characterName','?')}: {a.get('summary','')} → 判定{a.get('rollResult','?')}")

        prompt = self._build_prompt(region, world_day, summaries)
        narrative = await self._call_llm(prompt)
        if not narrative:
            return None

        lines = narrative.strip().split("\n")
        title = lines[0].strip("# ").strip() if lines else f"世界日{world_day}·{region}"
        body = "\n".join(lines[1:]) if len(lines) > 1 else narrative

        entry = {
            "id": f"wc_{world_day}_{region}",
            "worldDay": world_day,
            "region": region,
            "title": title,
            "narrative": body,
        }
        await self.chronicle_repo.save_world_chronicle(entry)
        chronicle_log.info(f"Chronicle saved: {title}")
        return entry

    def _build_prompt(self, region: str, world_day: int, summaries: list[str]) -> str:
        return f"""你是艾瑟兰大陆的编年史官。请将以下区域当日发生的所有冒险者行动汇总为一段编年史叙事。

【风格要求】
- 第三人称史诗风格，如史官撰写世界编年史
- 200-400字
- 重点描述有影响力的行为和结果
- 保持客观，不评判善恶
- 第一行是一句标题（以"#"开头）

【区域】{region}
【世界日】第{world_day}天

【当日事件】
{chr(10).join(summaries)}

请生成编年史叙事："""

    async def _call_llm(self, prompt: str) -> str:
        if not settings.llm_api_key:
            return self._fallback_aggregate(prompt)
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    settings.llm_endpoint,
                    headers={"Authorization": f"Bearer {settings.llm_api_key}", "Content-Type": "application/json"},
                    json={"model": settings.llm_model, "messages": [{"role": "user", "content": prompt}],
                          "temperature": settings.llm_temperature, "max_tokens": settings.llm_max_tokens})
                if resp.status_code != 200:
                    return self._fallback_aggregate(prompt)
                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                return msg.get("content") or msg.get("reasoning_content") or ""
        except Exception:
            return self._fallback_aggregate(prompt)

    def _fallback_aggregate(self, prompt: str) -> str:
        lines = [l for l in prompt.split("\n") if l.startswith("- ")]
        return f"# 本日综述\n\n本区域共记录了{len(lines)}起值得关注的事件。冒险者们的足迹遍布各处，他们的行动正在塑造这个世界的未来。"
