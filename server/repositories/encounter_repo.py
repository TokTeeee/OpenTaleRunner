"""奇遇 + 幽灵NPC 仓库"""
import json, uuid
from abc import ABC, abstractmethod
from db.database import Database


class IEncounterRepo(ABC):
    @abstractmethod
    async def create(self, etype: str, region: str, involved: list[str], desc: str) -> str: ...
    @abstractmethod
    async def get_pending(self, player_id: str) -> list[dict]: ...
    @abstractmethod
    async def resolve(self, enc_id: str) -> None: ...


class SqliteEncounterRepo(IEncounterRepo):
    def __init__(self, db: Database): self.db = db

    async def create(self, etype: str, region: str, involved: list[str], desc: str) -> str:
        eid = str(uuid.uuid4())
        await self.db.execute(
            "INSERT INTO encounters (id, type, region, involved_players, description) VALUES (?, ?, ?, ?, ?)",
            (eid, etype, region, json.dumps(involved), desc))
        return eid

    async def get_pending(self, player_id: str) -> list[dict]:
        rows = await self.db.fetch_all("SELECT * FROM encounters WHERE resolved=0 AND involved_players LIKE ?", (f"%{player_id}%",))
        return [dict(r) for r in rows]

    async def resolve(self, enc_id: str) -> None:
        await self.db.execute("UPDATE encounters SET resolved=1 WHERE id=?", (enc_id,))


class IGhostRepo(ABC):
    @abstractmethod
    async def upsert(self, ghost: dict) -> None: ...
    @abstractmethod
    async def get_by_region(self, region: str) -> list[dict]: ...
    @abstractmethod
    async def remove_expired(self) -> int: ...
    @abstractmethod
    async def remove_by_player(self, player_id: str) -> None: ...


class SqliteGhostRepo(IGhostRepo):
    def __init__(self, db: Database): self.db = db

    async def upsert(self, ghost: dict) -> None:
        await self.db.execute(
            "INSERT OR REPLACE INTO ghost_npcs (id, player_id, character_name, appearance, personality_tags, recent_actions, current_intent, attitude_to_strangers, known_info, region, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ghost.get("npcId", str(uuid.uuid4())), ghost.get("playerId", ""),
             ghost.get("characterName", ""), ghost.get("appearance", ""),
             json.dumps(ghost.get("personalityTags", [])), ghost.get("recentActions", ""),
             ghost.get("currentIntent", ""), ghost.get("attitudeToStrangers", "谨慎"),
             json.dumps(ghost.get("knownInfo", [])), ghost.get("region", ""), ghost.get("expiresAt", "")))

    async def get_by_region(self, region: str) -> list[dict]:
        rows = await self.db.fetch_all(
            "SELECT * FROM ghost_npcs WHERE region=? AND expires_at > datetime('now')", (region,))
        return [{
            "npcId": r["id"], "playerId": r["player_id"], "characterName": r["character_name"],
            "appearance": r["appearance"], "personalityTags": json.loads(r.get("personality_tags", "[]")),
            "recentActions": r["recent_actions"], "currentIntent": r["current_intent"],
            "attitudeToStrangers": r["attitude_to_strangers"],
            "knownInfo": json.loads(r.get("known_info", "[]")),
            "region": r["region"], "expiresAt": r["expires_at"]
        } for r in rows]

    async def remove_expired(self) -> int:
        cur = await self.db.execute("DELETE FROM ghost_npcs WHERE expires_at <= datetime('now')")
        return cur.rowcount

    async def remove_by_player(self, player_id: str) -> None:
        await self.db.execute("DELETE FROM ghost_npcs WHERE player_id=?", (player_id,))
