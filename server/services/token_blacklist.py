"""Token 黑名单 — 登出后 token 失效，定期清理过期条目"""
import time
import threading


class TokenBlacklist:
    def __init__(self):
        self._store: dict[str, float] = {}
        self._lock = threading.Lock()

    def revoke(self, token_hash: str, exp_timestamp: float):
        with self._lock:
            self._store[token_hash] = exp_timestamp

    def is_revoked(self, token_hash: str) -> bool:
        with self._lock:
            return token_hash in self._store

    def cleanup_expired(self) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            expired = [h for h, exp in self._store.items() if exp < now]
            for h in expired:
                del self._store[h]
                removed += 1
        return removed


blacklist = TokenBlacklist()
