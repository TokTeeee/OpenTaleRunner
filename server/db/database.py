"""数据库抽象层 — 解耦具体的数据库实现"""

from abc import ABC, abstractmethod
from typing import Any
import aiosqlite


class Database(ABC):
    @abstractmethod
    async def connect(self) -> None: ...
    @abstractmethod
    async def close(self) -> None: ...
    @abstractmethod
    async def execute(self, sql: str, params: tuple = ()) -> Any: ...
    @abstractmethod
    async def fetch_one(self, sql: str, params: tuple = ()) -> dict | None: ...
    @abstractmethod
    async def fetch_all(self, sql: str, params: tuple = ()) -> list[dict]: ...
    @abstractmethod
    async def execute_many(self, sql: str, params_list: list[tuple]) -> None: ...


class SqliteDatabase(Database):
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        import os
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._conn = await aiosqlite.connect(self.db_path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA foreign_keys=ON")

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()

    async def execute(self, sql: str, params: tuple = ()) -> Any:
        cur = await self._conn.execute(sql, params)
        await self._conn.commit()
        return cur

    async def fetch_one(self, sql: str, params: tuple = ()) -> dict | None:
        cur = await self._conn.execute(sql, params)
        row = await cur.fetchone()
        return dict(row) if row else None

    async def fetch_all(self, sql: str, params: tuple = ()) -> list[dict]:
        cur = await self._conn.execute(sql, params)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def execute_many(self, sql: str, params_list: list[tuple]) -> None:
        await self._conn.executemany(sql, params_list)
        await self._conn.commit()
