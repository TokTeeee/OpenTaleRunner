"""世界状态仓库"""
import json
from abc import ABC, abstractmethod
from db.database import Database


class IWorldRepo(ABC):
    @abstractmethod
    async def get_meta(self, key: str) -> str | None: ...
    @abstractmethod
    async def set_meta(self, key: str, value: str) -> None: ...
    @abstractmethod
    async def get_world_day(self) -> int: ...
    @abstractmethod
    async def set_world_day(self, day: int) -> None: ...
    @abstractmethod
    async def get_region_state(self, region_id: str) -> dict | None: ...
    @abstractmethod
    async def update_region_state(self, region_id: str, state: dict) -> None: ...
    @abstractmethod
    async def get_storybook(self) -> dict | None: ...
    @abstractmethod
    async def get_npc_templates(self) -> dict | None: ...


class SqliteWorldRepo(IWorldRepo):
    def __init__(self, db: Database): self.db = db

    async def get_meta(self, key: str) -> str | None:
        row = await self.db.fetch_one("SELECT value FROM world_meta WHERE key=?", (key,))
        return row["value"] if row else None

    async def set_meta(self, key: str, value: str) -> None:
        await self.db.execute("INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)", (key, value))

    async def get_world_day(self) -> int:
        v = await self.get_meta("world_day")
        return int(v) if v else 1

    async def set_world_day(self, day: int) -> None:
        await self.set_meta("world_day", str(day))

    async def get_region_state(self, region_id: str) -> dict | None:
        row = await self.db.fetch_one("SELECT * FROM world_state WHERE region_id=?", (region_id,))
        if not row:
            # Fallback from storybook
            sb = await self.get_storybook()
            if sb:
                for r in sb.get("regions", []):
                    if r.get("id") == region_id:
                        return {"id": region_id, "name": r.get("name",""), "terrain": r.get("terrain",""),
                                "weather": "晴朗", "factions": r.get("factions",[]),
                                "subRegions": [s["name"] for s in r.get("sub_regions",[])],
                                "currentEvents": []}
            return None
        return {
            "id": row["region_id"], "name": "", "terrain": "",
            "weather": row["weather"], "factions": json.loads(row.get("faction_data", "{}")),
            "subRegions": [], "currentEvents": json.loads(row.get("current_events", "[]"))
        }

    async def update_region_state(self, region_id: str, state: dict) -> None:
        await self.db.execute(
            "INSERT OR REPLACE INTO world_state (region_id, weather, current_events, faction_data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (region_id, state.get("weather", "晴朗"),
             json.dumps(state.get("currentEvents", []), ensure_ascii=False),
             json.dumps(state.get("faction_data", {}), ensure_ascii=False)))

    async def get_storybook(self) -> dict | None:
        v = await self.get_meta("storybook_data")
        return json.loads(v) if v else None

    async def get_npc_templates(self) -> dict | None:
        v = await self.get_meta("npc_templates")
        return json.loads(v) if v else None
