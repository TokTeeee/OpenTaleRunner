"""多人房间仓库 — 数据访问层"""

import json
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from db.database import Database


class IMultiplayerRepo(ABC):
    @abstractmethod
    async def create_room(self, room_id: str, host_id: str, mode: str, config: str, state: str) -> None: ...
    @abstractmethod
    async def get_room(self, room_id: str) -> Optional[Dict[str, Any]]: ...
    @abstractmethod
    async def update_room_state(self, room_id: str, state: str, actions_json: str = "{}", dice_json: str = "{}") -> None: ...
    @abstractmethod
    async def update_round_artifacts(self, room_id: str, last_round_result_json: str, narrative_history_json: str) -> None: ...
    @abstractmethod
    async def update_player_characters(self, room_id: str, characters_json: str) -> None: ...
    @abstractmethod
    async def update_character_slots(self, room_id: str, slots_json: str) -> None: ...
    @abstractmethod
    async def delete_room(self, room_id: str) -> None: ...
    @abstractmethod
    async def start_room(self, room_id: str, state: str) -> None: ...
    @abstractmethod
    async def update_room_notifications(self, room_id: str, notifications_json: str) -> None: ...

    # Session operations
    @abstractmethod
    async def add_session(self, session_data: Dict[str, Any]) -> None: ...
    @abstractmethod
    async def get_session(self, room_id: str, player_id: str) -> Optional[Dict[str, Any]]: ...
    @abstractmethod
    async def get_room_sessions(self, room_id: str) -> List[Dict[str, Any]]: ...
    @abstractmethod
    async def update_session(self, room_id: str, player_id: str, updates: Dict[str, Any]) -> None: ...
    @abstractmethod
    async def update_session_heartbeat(self, room_id: str, player_id: str) -> None: ...
    @abstractmethod
    async def remove_session(self, room_id: str, player_id: str) -> None: ...
    @abstractmethod
    async def get_active_rooms(self) -> List[str]: ...


class SqliteMultiplayerRepo(IMultiplayerRepo):
    def __init__(self, db: Database):
        self.db = db

    # ─── 房间操作 ───

    async def create_room(self, room_id: str, host_id: str, mode: str, config: str, state: str) -> None:
        await self.db.execute(
            """INSERT INTO multiplayer_rooms (room_id, host_player_id, mode, config_json, state_json)
               VALUES (?, ?, ?, ?, ?)""",
            (room_id, host_id, mode, config, state)
        )

    async def get_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        row = await self.db.fetch_one(
            "SELECT * FROM multiplayer_rooms WHERE room_id=?",
            (room_id,)
        )
        if not row:
            return None
        return {
            "room_id": row["room_id"],
            "host_player_id": row["host_player_id"],
            "mode": row["mode"],
            "config_json": row["config_json"],
            "state_json": row["state_json"],
            "current_round_actions_json": row["current_round_actions_json"],
            "current_round_dice_results_json": row["current_round_dice_results_json"],
            "last_round_result_json": row["last_round_result_json"],
            "narrative_history_json": row["narrative_history_json"],
            "character_slots_json": row["character_slots_json"],
            "player_characters_json": row["player_characters_json"],
            "room_notifications_json": row.get("room_notifications_json", "[]"),
            "created_at": row["created_at"],
            "started_at": row["started_at"],
            "ended_at": row["ended_at"],
            "updated_at": row["updated_at"],
        }

    async def update_room_state(self, room_id: str, state: str, actions_json: str = "{}", dice_json: str = "{}") -> None:
        await self.db.execute(
            """UPDATE multiplayer_rooms
               SET state_json=?, current_round_actions_json=?,
                   current_round_dice_results_json=?, updated_at=datetime('now')
               WHERE room_id=?""",
            (state, actions_json, dice_json, room_id)
        )

    async def update_round_artifacts(self, room_id: str, last_round_result_json: str, narrative_history_json: str) -> None:
        await self.db.execute(
            """UPDATE multiplayer_rooms
               SET last_round_result_json=?, narrative_history_json=?, updated_at=datetime('now')
               WHERE room_id=?""",
            (last_round_result_json, narrative_history_json, room_id)
        )

    async def update_player_characters(self, room_id: str, characters_json: str) -> None:
        await self.db.execute(
            "UPDATE multiplayer_rooms SET player_characters_json=?, updated_at=datetime('now') WHERE room_id=?",
            (characters_json, room_id)
        )

    async def update_character_slots(self, room_id: str, slots_json: str) -> None:
        await self.db.execute(
            "UPDATE multiplayer_rooms SET character_slots_json=?, updated_at=datetime('now') WHERE room_id=?",
            (slots_json, room_id)
        )

    async def delete_room(self, room_id: str) -> None:
        await self.db.execute("DELETE FROM room_player_sessions WHERE room_id=?", (room_id,))
        await self.db.execute("DELETE FROM multiplayer_rooms WHERE room_id=?", (room_id,))

    async def start_room(self, room_id: str, state: str) -> None:
        await self.db.execute(
            "UPDATE multiplayer_rooms SET state_json=?, started_at=datetime('now'), updated_at=datetime('now') WHERE room_id=?",
            (state, room_id)
        )

    async def update_room_notifications(self, room_id: str, notifications_json: str) -> None:
        await self.db.execute(
            "UPDATE multiplayer_rooms SET room_notifications_json=?, updated_at=datetime('now') WHERE room_id=?",
            (notifications_json, room_id)
        )

    # ─── 会话操作 ───

    async def add_session(self, session_data: Dict[str, Any]) -> None:
        await self.db.execute(
            """INSERT OR REPLACE INTO room_player_sessions
               (id, room_id, player_id, player_name, character_id, character_name,
                character_background, is_host, is_ready, is_online, status, slot_id,
                joined_at_round, last_heartbeat, joined_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                f"{session_data['room_id']}_{session_data['player_id']}",
                session_data["room_id"],
                session_data["player_id"],
                session_data.get("player_name", ""),
                session_data.get("character_id"),
                session_data.get("character_name"),
                session_data.get("character_background"),
                session_data.get("is_host", False),
                session_data.get("is_ready", False),
                session_data.get("is_online", True),
                session_data.get("status", "waiting"),
                session_data.get("slot_id"),
                session_data.get("joined_at_round", 0),
                session_data.get("last_heartbeat", ""),
            )
        )

    async def get_session(self, room_id: str, player_id: str) -> Optional[Dict[str, Any]]:
        row = await self.db.fetch_one(
            "SELECT * FROM room_player_sessions WHERE room_id=? AND player_id=?",
            (room_id, player_id)
        )
        return dict(row) if row else None

    async def get_room_sessions(self, room_id: str) -> List[Dict[str, Any]]:
        rows = await self.db.fetch_all(
            "SELECT * FROM room_player_sessions WHERE room_id=? ORDER BY joined_at ASC, id ASC",
            (room_id,)
        )
        return [dict(r) for r in rows]

    async def update_session(self, room_id: str, player_id: str, updates: Dict[str, Any]) -> None:
        sets = []
        params = []
        for k, v in updates.items():
            sets.append(f"{k}=?")
            params.append(v)
        params.extend([room_id, player_id])

        sql = f"UPDATE room_player_sessions SET {', '.join(sets)}"
        sql += " WHERE room_id=? AND player_id=?"

        await self.db.execute(sql, tuple(params))

    async def update_session_heartbeat(self, room_id: str, player_id: str) -> None:
        await self.db.execute(
            "UPDATE room_player_sessions SET last_heartbeat=datetime('now'), is_online=1 WHERE room_id=? AND player_id=?",
            (room_id, player_id)
        )

    async def remove_session(self, room_id: str, player_id: str) -> None:
        await self.db.execute(
            "DELETE FROM room_player_sessions WHERE room_id=? AND player_id=?",
            (room_id, player_id)
        )

    async def get_active_rooms(self) -> List[str]:
        """获取所有未结束的房间ID列表（含等待和进行中的）"""
        rows = await self.db.fetch_all(
            "SELECT room_id FROM multiplayer_rooms WHERE ended_at IS NULL"
        )
        return [r["room_id"] for r in rows]
