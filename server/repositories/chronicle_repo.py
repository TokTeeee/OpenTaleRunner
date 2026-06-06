"""编年史仓库"""
import json, uuid
from abc import ABC, abstractmethod
from db.database import Database


class IChronicleRepo(ABC):
    @abstractmethod
    async def upload_batch(self, player_id: str, entries: list[dict]) -> int: ...
    @abstractmethod
    async def get_by_day(self, world_day: int) -> list[dict]: ...
    @abstractmethod
    async def get_world_chronicle(self, world_day: int | None = None, limit: int = 10) -> list[dict]: ...
    @abstractmethod
    async def get_recent_by_region(self, region: str, world_day: int) -> list[dict]: ...
    @abstractmethod
    async def save_world_chronicle(self, entry: dict) -> None: ...
    @abstractmethod
    async def get_latest_world_chronicle(self, limit: int = 5) -> list[dict]: ...


class SqliteChronicleRepo(IChronicleRepo):
    def __init__(self, db: Database): self.db = db

    async def upload_batch(self, player_id: str, entries: list[dict]) -> int:
        count = 0
        for e in entries:
            await self.db.execute(
                "INSERT OR IGNORE INTO chronicle_entries (id, player_id, character_name, world_day, region, data) VALUES (?, ?, ?, ?, ?, ?)",
                (e.get("entryId", str(uuid.uuid4())), player_id,
                 e.get("characterName", ""), e.get("worldDay", 1),
                 e.get("location", {}).get("region", ""), json.dumps(e, ensure_ascii=False)))
            count += 1
        return count

    async def get_by_day(self, world_day: int) -> list[dict]:
        rows = await self.db.fetch_all("SELECT data FROM chronicle_entries WHERE world_day=?", (world_day,))
        return [json.loads(r["data"]) for r in rows]

    async def get_world_chronicle(self, world_day: int | None = None, limit: int = 10) -> list[dict]:
        if world_day:
            rows = await self.db.fetch_all(
                "SELECT * FROM world_chronicle WHERE world_day=? ORDER BY created_at DESC LIMIT ?", (world_day, limit))
        else:
            rows = await self.db.fetch_all(
                "SELECT * FROM world_chronicle ORDER BY world_day DESC, created_at DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]

    async def get_recent_by_region(self, region: str, world_day: int) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT data FROM chronicle_entries WHERE region=? AND world_day=? ORDER BY synced_at DESC LIMIT 50",
            (region, world_day))
        return [json.loads(r["data"]) for r in rows]

    async def save_world_chronicle(self, entry: dict) -> None:
        await self.db.execute(
            "INSERT OR REPLACE INTO world_chronicle (id, world_day, region, title, narrative) VALUES (?, ?, ?, ?, ?)",
            (entry.get("id", str(uuid.uuid4())), entry.get("worldDay", 1),
             entry.get("region", ""), entry.get("title", ""), entry.get("narrative", "")))

    async def get_latest_world_chronicle(self, limit: int = 5) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT * FROM world_chronicle ORDER BY world_day DESC, created_at DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]
