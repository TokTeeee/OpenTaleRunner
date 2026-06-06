"""角色仓库"""
import json, uuid
from abc import ABC, abstractmethod
from db.database import Database


# v0.5.1 幂等迁移: 给 v0.4 存档补 level/exp/expToNext/unspentAttributePoints/classId/classSkills,
# 并把属性钳制从 [3, 18] 放宽为 [1, 20]. 每次 create/update 都跑一次, 已带这些字段的存档原样通过.
def _migrate_v04_to_v05(data: dict) -> dict:
    data.setdefault("level", 1)
    data.setdefault("exp", 0)
    data.setdefault("expToNext", 100)
    data.setdefault("unspentAttributePoints", 0)
    data.setdefault("classId", None)
    data.setdefault("classSkills", [])
    attrs = data.get("attributes", {})
    for k in ("STR", "DEX", "CON", "INT", "WIS", "CHA"):
        if k in attrs:
            try:
                attrs[k] = max(1, min(20, int(attrs[k])))
            except (TypeError, ValueError):
                attrs[k] = 10
    return data


class ICharacterRepo(ABC):
    @abstractmethod
    async def create(self, player_id: str, data: dict) -> str: ...
    @abstractmethod
    async def get(self, char_id: str) -> dict | None: ...
    @abstractmethod
    async def update(self, char_id: str, data: dict) -> None: ...
    @abstractmethod
    async def get_history(self, char_id: str) -> list[dict]: ...
    @abstractmethod
    async def list_by_player(self, player_id: str) -> list[dict]: ...


class SqliteCharacterRepo(ICharacterRepo):
    def __init__(self, db: Database): self.db = db

    async def create(self, player_id: str, data: dict) -> str:
        data = _migrate_v04_to_v05(data)
        cid = data.get("characterId") or str(uuid.uuid4())
        region = data.get("joinedRegion", data.get("region", ""))
        wd = data.get("joinedWorldDay", data.get("world_day", 1))
        await self.db.execute(
            "INSERT INTO characters (id, player_id, data, region, world_day) VALUES (?, ?, ?, ?, ?)",
            (cid, player_id, json.dumps(data, ensure_ascii=False), region, wd))
        return cid

    async def get(self, char_id: str) -> dict | None:
        row = await self.db.fetch_one("SELECT data FROM characters WHERE id=?", (char_id,))
        return json.loads(row["data"]) if row else None

    async def update(self, char_id: str, data: dict) -> None:
        region = data.get("joinedRegion", data.get("world_state", {}).get("current_region", ""))
        await self.db.execute(
            "UPDATE characters SET data=?, region=?, updated_at=datetime('now') WHERE id=?",
            (json.dumps(data, ensure_ascii=False), region, char_id))

    async def get_history(self, char_id: str) -> list[dict]:
        row = await self.db.fetch_one("SELECT data FROM characters WHERE id=?", (char_id,))
        if not row: return []
        d = json.loads(row["data"])
        return d.get("recentHistory", [])

    async def list_by_player(self, player_id: str) -> list[dict]:
        rows = await self.db.fetch_all("SELECT id, data FROM characters WHERE player_id=?", (player_id,))
        return [{"characterId": r["id"], **json.loads(r["data"])} for r in rows]
