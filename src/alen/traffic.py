from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import logging
import os
import time
from typing import Iterator

from fastapi import Request
from fastapi.responses import JSONResponse

from .cache import SharedCache, shared_cache


_logger = logging.getLogger("alen.traffic")


@dataclass(frozen=True, slots=True)
class RatePolicy:
    burst_10s: int
    per_minute: int
    global_per_minute: int


@dataclass(frozen=True, slots=True)
class RateDecision:
    allowed: bool
    retry_after: int = 0
    scope: str = ""


class CapacityExceeded(RuntimeError):
    def __init__(self, name: str, retry_after: int = 2) -> None:
        super().__init__(f"capacity exceeded: {name}")
        self.name = name
        self.retry_after = max(1, int(retry_after))


DEFAULT_POLICY = RatePolicy(burst_10s=80, per_minute=300, global_per_minute=3000)
RATE_POLICIES: dict[str, RatePolicy] = {
    "/api/v1/health": RatePolicy(30, 120, 1200),
    "/api/v1/airports": RatePolicy(20, 90, 900),
    "/api/v1/aircraft": RatePolicy(30, 120, 1200),
    "/api/v1/satellites": RatePolicy(24, 90, 900),
    "/api/v1/aircraft/route": RatePolicy(15, 60, 500),
    "/api/v1/aircraft/photo": RatePolicy(12, 45, 360),
    "/api/v1/aircraft/service-photo": RatePolicy(10, 30, 240),
    "/api/v1/satellite/info": RatePolicy(12, 45, 360),
    "/api/v1/satellite/photo": RatePolicy(10, 30, 240),
    "/api/v1/aircraft/photo/image": RatePolicy(6, 24, 120),
    "/api/v1/aircraft/service-photo/image": RatePolicy(5, 18, 90),
    "/api/v1/satellite/photo/image": RatePolicy(5, 18, 90),
}


def _enabled() -> bool:
    value = os.getenv("ALEN_RATE_LIMITS_ENABLED", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _multiplier() -> float:
    raw = os.getenv("ALEN_RATE_LIMIT_MULTIPLIER", "1").strip()
    try:
        return max(0.25, min(10.0, float(raw)))
    except ValueError:
        return 1.0


def _scaled(limit: int) -> int:
    return max(1, int(round(limit * _multiplier())))


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("cf-connecting-ip", "").strip()
    if forwarded:
        return forwarded[:64]

    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first = forwarded_for.split(",", 1)[0].strip()
        if first:
            return first[:64]

    if request.client is not None and request.client.host:
        return str(request.client.host)[:64]
    return "unknown"


def _client_key(request: Request) -> str:
    digest = hashlib.sha256(client_ip(request).encode("utf-8", errors="ignore")).hexdigest()
    return digest[:24]


def _window_retry(window_seconds: int, now: float) -> int:
    elapsed = int(now) % window_seconds
    return max(1, window_seconds - elapsed)


def check_rate_limit(
    request: Request,
    *,
    cache: SharedCache = shared_cache,
    now: float | None = None,
) -> RateDecision:
    if not _enabled() or request.method.upper() != "GET":
        return RateDecision(True)
    path = request.url.path
    if not path.startswith("/api/v1/"):
        return RateDecision(True)

    policy = RATE_POLICIES.get(path, DEFAULT_POLICY)
    timestamp = time.time() if now is None else float(now)
    client = _client_key(request)

    checks = (
        ("client-burst", 10, _scaled(policy.burst_10s), f"ip:{client}:{path}:10"),
        ("client-minute", 60, _scaled(policy.per_minute), f"ip:{client}:{path}:60"),
        ("global-minute", 60, _scaled(policy.global_per_minute), f"global:{path}:60"),
    )
    for scope, window_seconds, limit, key in checks:
        count = cache.increment_window(key, ttl_seconds=window_seconds + 2)
        if count > limit:
            return RateDecision(
                False,
                retry_after=_window_retry(window_seconds, timestamp),
                scope=scope,
            )
    return RateDecision(True)


def limited_response(request: Request, decision: RateDecision) -> JSONResponse:
    retry_after = max(1, int(decision.retry_after or 1))
    ray = request.headers.get("cf-ray", "").strip()
    _logger.warning(
        "Rate limit rejected request path=%s client_ip=%s scope=%s cf_ray=%s",
        request.url.path,
        client_ip(request),
        decision.scope or "unknown",
        ray or "-",
    )
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests",
            "retry_after_seconds": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "Cache-Control": "no-store",
            "X-ALEN-RateLimit-Scope": decision.scope or "unknown",
        },
    )


@contextmanager
def capacity(
    name: str,
    limit: int,
    *,
    ttl_seconds: int = 30,
    cache: SharedCache = shared_cache,
) -> Iterator[None]:
    slot = cache.acquire_slot(name, limit=max(1, int(limit)), ttl_seconds=ttl_seconds)
    if slot is None:
        raise CapacityExceeded(name)
    try:
        yield
    finally:
        cache.release_slot(name, slot)
