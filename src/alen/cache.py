from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import json
import os
import threading
import time
import uuid
import zlib

try:
    import redis
except ImportError:  # pragma: no cover - production installs redis
    redis = None


@dataclass
class _LocalEntry:
    expires_at: float
    payload: bytes


class SharedCache:
    """Redis/Valkey cache with a strictly bounded in-process fallback.

    Values are compressed JSON. The local fallback exists so ALEN continues to
    work if the shared cache is temporarily unavailable, but it is capped by
    both entry count and bytes so it cannot recreate the memory-growth problem.
    """

    def __init__(
        self,
        *,
        url: str | None = None,
        namespace: str = "alen:v1",
        local_max_entries: int = 256,
        local_max_bytes: int = 4 * 1024 * 1024,
    ) -> None:
        self.namespace = namespace.strip(":")
        self.local_max_entries = max(16, int(local_max_entries))
        self.local_max_bytes = max(512 * 1024, int(local_max_bytes))
        self._local: OrderedDict[str, _LocalEntry] = OrderedDict()
        self._local_bytes = 0
        self._local_locks: dict[str, tuple[str, float]] = {}
        self._guard = threading.Lock()
        self._redis = None

        redis_url = url or os.getenv("ALEN_REDIS_URL") or os.getenv("REDIS_URL")
        if redis_url and redis is not None:
            try:
                pool = redis.ConnectionPool.from_url(
                    redis_url,
                    max_connections=8,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                    health_check_interval=30,
                    decode_responses=False,
                )
                client = redis.Redis(connection_pool=pool)
                client.ping()
                self._redis = client
            except Exception:
                self._redis = None

    @property
    def distributed(self) -> bool:
        return self._redis is not None

    def _key(self, key: str) -> str:
        return f"{self.namespace}:{key}"

    @staticmethod
    def _encode(value: object) -> bytes:
        raw = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return b"z1" + zlib.compress(raw, level=3)

    @staticmethod
    def _decode(payload: bytes) -> object | None:
        try:
            raw = zlib.decompress(payload[2:]) if payload.startswith(b"z1") else payload
            return json.loads(raw.decode("utf-8"))
        except (ValueError, TypeError, zlib.error, UnicodeDecodeError):
            return None

    def get_json(self, key: str) -> object | None:
        namespaced = self._key(key)
        if self._redis is not None:
            try:
                payload = self._redis.get(namespaced)
                if payload:
                    decoded = self._decode(bytes(payload))
                    if decoded is not None:
                        return decoded
            except Exception:
                pass

        now = time.monotonic()
        with self._guard:
            entry = self._local.get(namespaced)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._drop_local(namespaced)
                return None
            self._local.move_to_end(namespaced)
            payload = entry.payload
        return self._decode(payload)

    def set_json(self, key: str, value: object, *, ttl_seconds: float) -> None:
        payload = self._encode(value)
        ttl = max(1, int(round(ttl_seconds)))
        namespaced = self._key(key)

        if self._redis is not None:
            try:
                self._redis.set(namespaced, payload, ex=ttl)
            except Exception:
                pass

        with self._guard:
            prior = self._local.pop(namespaced, None)
            if prior is not None:
                self._local_bytes -= len(prior.payload)
            self._local[namespaced] = _LocalEntry(
                expires_at=time.monotonic() + ttl,
                payload=payload,
            )
            self._local_bytes += len(payload)
            self._prune_local()

    def acquire_lock(self, key: str, *, ttl_seconds: int = 8) -> str | None:
        token = uuid.uuid4().hex
        namespaced = self._key(f"lock:{key}")
        ttl = max(1, int(ttl_seconds))

        if self._redis is not None:
            try:
                if self._redis.set(namespaced, token.encode("ascii"), nx=True, ex=ttl):
                    return token
                return None
            except Exception:
                pass

        now = time.monotonic()
        with self._guard:
            expired = [name for name, (_, until) in self._local_locks.items() if until <= now]
            for name in expired:
                self._local_locks.pop(name, None)
            if namespaced in self._local_locks:
                return None
            self._local_locks[namespaced] = (token, now + ttl)
        return token

    def release_lock(self, key: str, token: str) -> None:
        namespaced = self._key(f"lock:{key}")
        if self._redis is not None:
            try:
                self._redis.eval(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    "return redis.call('del', KEYS[1]) else return 0 end",
                    1,
                    namespaced,
                    token.encode("ascii"),
                )
            except Exception:
                pass

        with self._guard:
            current = self._local_locks.get(namespaced)
            if current and current[0] == token:
                self._local_locks.pop(namespaced, None)

    def _drop_local(self, key: str) -> None:
        entry = self._local.pop(key, None)
        if entry is not None:
            self._local_bytes -= len(entry.payload)

    def _prune_local(self) -> None:
        now = time.monotonic()
        expired = [key for key, entry in self._local.items() if entry.expires_at <= now]
        for key in expired:
            self._drop_local(key)
        while (
            len(self._local) > self.local_max_entries
            or self._local_bytes > self.local_max_bytes
        ):
            key, entry = self._local.popitem(last=False)
            self._local_bytes -= len(entry.payload)


shared_cache = SharedCache()
