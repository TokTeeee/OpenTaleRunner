"""NPC 仓库"""
import json
from abc import ABC, abstractmethod
from db.database import Database


class INPCRepo(ABC):
    @abstractmethod
    async def register(self, npc: dict, owner_player_id: str | None = None) -> str: ...
    @abstractmethod
    async def get(self, npc_id: str) -> dict | None: ...
    @abstractmethod
    async def get_by_region(self, region: str) -> list[dict]: ...
    @abstractmethod
    async def get_known(self, npc_ids: list[str], player_id: str) -> list[dict]: ...
    @abstractmethod
    async def update_relationship(self, npc_id: str, player_id: str, rel: dict) -> None: ...
    @abstractmethod
    async def get_relationship(self, npc_id: str, player_id: str) -> dict | None: ...
    @abstractmethod
    async def promote(self, npc_id: str) -> None: ...
    @abstractmethod
    async def patch_data(self, npc_id: str, updates: dict) -> None: ...
    @abstractmethod
    async def get_all_relationships(self, npc_id: str) -> list[dict]: ...


def normalize_npc_data(raw: dict) -> dict:
    """将 NPC 数据规范化为标准结构"""
    return {
        "name": raw.get("name", ""),
        "title": raw.get("title", ""),
        "appearance": raw.get("appearance", ""),
        "personality": raw.get("personality", ""),
        "background": raw.get("background", ""),
        "region": raw.get("region", ""),
        "sub_region": raw.get("subRegion", ""),
        "attributes": raw.get("attributes", {}),
        "skills": raw.get("skills", []),
        "voice_params": raw.get("voice_params"),
        "portrait": raw.get("portrait"),
        "behavior_config": raw.get("behavior_config", {
            "behavior_type": "rule",
            "npc_role": raw.get("npc_role", "civilian"),
            "schedule": "diurnal",
            "can_travel": False,
        }),
        "promotion_info": raw.get("promotion_info"),
        "is_hostile": raw.get("isHostile", False),
        "can_be_recruited": raw.get("canBeRecruited", False),
        "can_grow": raw.get("canGrow", True),
        "faction": raw.get("faction", ""),
        "motivation": raw.get("motivation", ""),
        "secrets": raw.get("secrets", []),
    }


class SqliteNPCRepo(INPCRepo):
    def __init__(self, db: Database): self.db = db

    async def register(self, npc: dict, owner_player_id: str | None = None) -> str:
        nid = npc.get("npcId", npc.get("id", ""))
        normalized = normalize_npc_data(npc)
        await self.db.execute(
            "INSERT OR REPLACE INTO npc_registry (id, name, region, data, source, owner_player_id) VALUES (?, ?, ?, ?, ?, ?)",
            (nid, npc.get("name", ""), npc.get("region", ""),
             json.dumps(normalized, ensure_ascii=False), npc.get("source", "client_created"), owner_player_id))
        return nid

    async def get(self, npc_id: str) -> dict | None:
        row = await self.db.fetch_one("SELECT * FROM npc_registry WHERE id=?", (npc_id,))
        if not row: return None
        d = json.loads(row["data"])
        d["npcId"] = row["id"]
        d["source"] = row["source"]
        d["promoted"] = bool(row.get("promoted", 0))
        return d

    async def get_by_region(self, region: str) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT * FROM npc_registry WHERE region=? AND owner_player_id IS NULL", (region,))
        return [{**json.loads(r["data"]), "npcId": r["id"], "source": r["source"],
                 "promoted": bool(r.get("promoted", 0))} for r in rows]

    async def get_known(self, npc_ids: list[str], player_id: str) -> list[dict]:
        result = []
        for nid in npc_ids:
            npc = await self.get(nid)
            if npc:
                rel = await self.get_relationship(nid, player_id)
                npc["relationship"] = rel
                npc["isMet"] = rel is not None
                result.append(npc)
        return result

    async def update_relationship(self, npc_id: str, player_id: str, rel: dict) -> None:
        old = await self.get_relationship(npc_id, player_id)
        if old:
            count = rel.get("interactionCount", old.get("interactionCount", 0) + 1)
            await self.db.execute(
                "UPDATE npc_relationships SET attitude=?, level=?, interaction_count=?, history=?, player_knows=?, first_met=COALESCE(first_met, ?) WHERE npc_id=? AND player_id=?",
                (rel.get("attitude", old.get("attitude", 0)),
                 rel.get("level", old.get("level", "stranger")),
                 count,
                 json.dumps(rel.get("history", []), ensure_ascii=False),
                 json.dumps(rel.get("playerKnowsAbout", []), ensure_ascii=False),
                 rel.get("firstMet", ""), npc_id, player_id))
        else:
            await self.db.execute(
                "INSERT INTO npc_relationships (npc_id, player_id, attitude, level, first_met, interaction_count, history, player_knows) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (npc_id, player_id, rel.get("attitude", 0), rel.get("level", "stranger"),
                 rel.get("firstMet", ""), rel.get("interactionCount", 1),
                 json.dumps(rel.get("history", []), ensure_ascii=False),
                 json.dumps(rel.get("playerKnowsAbout", []), ensure_ascii=False)))

    async def get_relationship(self, npc_id: str, player_id: str) -> dict | None:
        row = await self.db.fetch_one(
            "SELECT * FROM npc_relationships WHERE npc_id=? AND player_id=?", (npc_id, player_id))
        if not row: return None
        return {
            "attitude": row["attitude"], "level": row["level"],
            "firstMet": row["first_met"], "interactionCount": row["interaction_count"],
            "history": json.loads(row.get("history", "[]")),
            "playerKnowsAbout": json.loads(row.get("player_knows", "[]"))
        }

    async def promote(self, npc_id: str) -> None:
        npc = await self.get(npc_id)
        if not npc: return
        data = json.loads((await self.db.fetch_one(
            "SELECT data FROM npc_registry WHERE id=?", (npc_id,))).get("data", "{}"))
        data["behavior_config"] = {**(data.get("behavior_config", {}) or {}), "behavior_type": "llm"}
        data["promotion_info"] = {
            "promoted_at": __import__('datetime').datetime.utcnow().isoformat(),
            "promotion_reason": "关系度达标",
        }
        await self.db.execute(
            "UPDATE npc_registry SET promoted=1, data=?, updated_at=datetime('now') WHERE id=?",
            (json.dumps(data, ensure_ascii=False), npc_id))

    async def patch_data(self, npc_id: str, updates: dict) -> None:
        """合并更新 data JSON 字段中的指定 key"""
        row = await self.db.fetch_one("SELECT data FROM npc_registry WHERE id=?", (npc_id,))
        if not row: return
        data = json.loads(row["data"])
        data.update(updates)
        await self.db.execute(
            "UPDATE npc_registry SET data=?, updated_at=datetime('now') WHERE id=?",
            (json.dumps(data, ensure_ascii=False), npc_id))

    async def get_all_relationships(self, npc_id: str) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT player_id, attitude, level, interaction_count FROM npc_relationships WHERE npc_id=?",
            (npc_id,))
        return [dict(r) for r in rows]
