"""物品世界注册表仓库 — PR-1"""
import json
from abc import ABC, abstractmethod
from typing import Optional
from db.database import Database


class IItemRepo(ABC):
    @abstractmethod
    async def register(self, player_id: str, item: dict) -> str: ...
    @abstractmethod
    async def get(self, item_id: str) -> dict | None: ...
    @abstractmethod
    async def list_by_player(self, player_id: str) -> list[dict]: ...
    @abstractmethod
    async def list_by_holder(self, kind: str, ref_id: str | None) -> list[dict]: ...
    @abstractmethod
    async def list_by_region(self, region: str) -> list[dict]: ...
    @abstractmethod
    async def update(self, item_id: str, item: dict) -> None: ...
    @abstractmethod
    async def delete(self, item_id: str) -> None: ...


def normalize_item_data(raw: dict) -> dict:
    """规范化 WorldItem data 字段, 确保 server-side 永远有完整结构"""
    return {
        "itemId": raw.get("itemId") or raw.get("id"),
        "name": raw.get("name", "未知物品"),
        "category": raw.get("category", "consumable"),
        "quality": raw.get("quality", "普通"),
        "effects": raw.get("effects", []),
        "description": raw.get("description", ""),
        "value": raw.get("value", 0),
        "durability": raw.get("durability"),
        "history": raw.get("history", []),
        "holder": raw.get("holder"),  # null = 销毁
        "quantity": raw.get("quantity", 1),
        "spawnInfo": raw.get("spawnInfo", {
            "worldDay": 1,
            "region": "",
            "source": "unknown",
        }),
        "createdAt": raw.get("createdAt"),
        "updatedAt": raw.get("updatedAt"),
    }


class SqliteItemRepo(IItemRepo):
    def __init__(self, db: Database): self.db = db

    async def register(self, player_id: str, item: dict) -> str:
        normalized = normalize_item_data(item)
        item_id = normalized["itemId"]
        holder = normalized.get("holder") or {}
        await self.db.execute(
            "INSERT OR REPLACE INTO item_registry (id, name, data, holder_kind, holder_ref_id, region, player_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (item_id,
             normalized["name"],
             json.dumps(normalized, ensure_ascii=False),
             holder.get("kind"),
             holder.get("refId"),
             normalized.get("spawnInfo", {}).get("region", ""),
             player_id))
        return item_id

    async def get(self, item_id: str) -> dict | None:
        row = await self.db.fetch_one("SELECT data FROM item_registry WHERE id=?", (item_id,))
        if not row: return None
        return json.loads(row["data"])

    async def list_by_player(self, player_id: str) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT data FROM item_registry WHERE player_id=? ORDER BY updated_at DESC",
            (player_id,))
        return [json.loads(r["data"]) for r in rows]

    async def list_by_holder(self, kind: str, ref_id: Optional[str]) -> list[dict]:
        if ref_id is None:
            rows = await self.db.fetch_all(
                "SELECT data FROM item_registry WHERE holder_kind=? AND holder_ref_id IS NULL",
                (kind,))
        else:
            rows = await self.db.fetch_all(
                "SELECT data FROM item_registry WHERE holder_kind=? AND holder_ref_id=?",
                (kind, ref_id))
        return [json.loads(r["data"]) for r in rows]

    async def list_by_region(self, region: str) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT data FROM item_registry WHERE region=? ORDER BY updated_at DESC",
            (region,))
        return [json.loads(r["data"]) for r in rows]

    async def update(self, item_id: str, item: dict) -> None:
        existing = await self.get(item_id)
        if not existing: return
        merged = normalize_item_data({**existing, **item})
        holder = merged.get("holder") or {}
        await self.db.execute(
            "UPDATE item_registry SET name=?, data=?, holder_kind=?, holder_ref_id=?, "
            "region=?, updated_at=datetime('now') WHERE id=?",
            (merged["name"],
             json.dumps(merged, ensure_ascii=False),
             holder.get("kind"),
             holder.get("refId"),
             merged.get("spawnInfo", {}).get("region", ""),
             item_id))

    async def delete(self, item_id: str) -> None:
        # 软删除: 实际很少调用, 多数销毁走 update(holder=null)
        await self.db.execute("DELETE FROM item_registry WHERE id=?", (item_id,))
