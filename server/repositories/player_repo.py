"""玩家仓库"""
from abc import ABC, abstractmethod
import hashlib
import hmac
import secrets
import uuid
from db.database import Database


class IPlayerRepo(ABC):
    @abstractmethod
    async def register(self, username: str, password: str) -> dict: ...
    @abstractmethod
    async def login(self, username: str, password: str) -> dict | None: ...


class SqlitePlayerRepo(IPlayerRepo):
    def __init__(self, db: Database): self.db = db

    _PBKDF2_ITERATIONS = 390000

    @staticmethod
    def _hash(pw: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            pw.encode(),
            salt,
            SqlitePlayerRepo._PBKDF2_ITERATIONS,
        )
        return f"pbkdf2_sha256${SqlitePlayerRepo._PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"

    @staticmethod
    def _verify(pw: str, hashed: str) -> bool:
        if not hashed.startswith("pbkdf2_sha256$"):
            return False

        try:
            _, iterations, salt_hex, digest_hex = hashed.split("$", 3)
            candidate = hashlib.pbkdf2_hmac(
                "sha256",
                pw.encode(),
                bytes.fromhex(salt_hex),
                int(iterations),
            ).hex()
        except Exception:
            return False

        return hmac.compare_digest(candidate, digest_hex)

    async def register(self, username: str, password: str) -> dict:
        pid = str(uuid.uuid4())
        await self.db.execute(
            "INSERT INTO players (id, username, password_hash) VALUES (?, ?, ?)",
            (pid, username, self._hash(password)))
        return {"player_id": pid, "username": username}

    async def login(self, username: str, password: str) -> dict | None:
        row = await self.db.fetch_one(
            "SELECT id, username, password_hash FROM players WHERE username=?",
            (username,))
        if not row:
            return None
        if self._verify(password, row["password_hash"]):
            return {"id": row["id"], "username": row["username"]}
        return None
