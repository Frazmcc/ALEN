from __future__ import annotations

from starlette.requests import Request

from alen.aircraft import AircraftProvider
from alen.cache import SharedCache
from alen.traffic import (
    RATE_POLICIES,
    RateDecision,
    RatePolicy,
    capacity,
    check_rate_limit,
    client_ip,
    limited_response,
)


def _request(
    path: str,
    *,
    ip: str = "203.0.113.10",
    cf_ip: str | None = None,
    forwarded_for: str | None = None,
    cf_ray: str | None = None,
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cf_ip:
        headers.append((b"cf-connecting-ip", cf_ip.encode()))
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    if cf_ray:
        headers.append((b"cf-ray", cf_ray.encode()))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": headers,
            "client": (ip, 12345),
            "server": ("alen.test", 443),
            "root_path": "",
        }
    )


def test_client_ip_prefers_cloudflare_forwarded_address() -> None:
    request = _request(
        "/api/v1/health",
        ip="10.0.0.1",
        cf_ip="198.51.100.25",
        forwarded_for="192.0.2.1, 10.0.0.1",
    )
    assert client_ip(request) == "198.51.100.25"


def test_rate_limiter_rejects_burst_and_returns_retry_after(monkeypatch) -> None:
    path = "/api/v1/test-rate-limit"
    monkeypatch.setitem(
        RATE_POLICIES,
        path,
        RatePolicy(burst_10s=2, per_minute=20, global_per_minute=100),
    )
    cache = SharedCache(namespace="test-rate-limiter")
    request = _request(path, cf_ip="198.51.100.50", cf_ray="test-ray")

    assert check_rate_limit(request, cache=cache, now=101.0).allowed
    assert check_rate_limit(request, cache=cache, now=101.0).allowed
    decision = check_rate_limit(request, cache=cache, now=101.0)

    assert not decision.allowed
    assert decision.scope == "client-burst"
    assert decision.retry_after == 9

    response = limited_response(request, decision)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "9"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-alen-ratelimit-scope"] == "client-burst"


def test_rate_limiter_separates_clients(monkeypatch) -> None:
    path = "/api/v1/test-client-separation"
    monkeypatch.setitem(
        RATE_POLICIES,
        path,
        RatePolicy(burst_10s=1, per_minute=10, global_per_minute=100),
    )
    cache = SharedCache(namespace="test-rate-client-separation")
    first = _request(path, cf_ip="198.51.100.1")
    second = _request(path, cf_ip="198.51.100.2")

    assert check_rate_limit(first, cache=cache, now=120.0).allowed
    assert not check_rate_limit(first, cache=cache, now=120.0).allowed
    assert check_rate_limit(second, cache=cache, now=120.0).allowed


def test_shared_cache_capacity_slots_limit_concurrency() -> None:
    cache = SharedCache(namespace="test-capacity-slots")
    first = cache.acquire_slot("images", limit=2, ttl_seconds=30)
    second = cache.acquire_slot("images", limit=2, ttl_seconds=30)
    third = cache.acquire_slot("images", limit=2, ttl_seconds=30)

    assert first is not None
    assert second is not None
    assert third is None

    cache.release_slot("images", first)
    replacement = cache.acquire_slot("images", limit=2, ttl_seconds=30)
    assert replacement is not None

    cache.release_slot("images", second)
    cache.release_slot("images", replacement)


def test_capacity_context_releases_slot() -> None:
    cache = SharedCache(namespace="test-capacity-context")
    with capacity("satellite-work", 1, cache=cache):
        assert cache.acquire_slot("satellite-work", limit=1, ttl_seconds=30) is None

    slot = cache.acquire_slot("satellite-work", limit=1, ttl_seconds=30)
    assert slot is not None
    cache.release_slot("satellite-work", slot)


def test_wide_aircraft_radar_quantizes_nearby_requests(monkeypatch) -> None:
    cache = SharedCache(namespace="test-wide-aircraft-radar")
    provider = AircraftProvider(cache=cache)
    calls: list[tuple[float, float, int]] = []

    def fake_fetch(lat: float, lon: float, radius_nm: int):
        calls.append((lat, lon, radius_nm))
        return {"fetched_at": 100.0, "ac": []}

    monkeypatch.setattr(provider, "_fetch_snapshot", fake_fetch)
    monkeypatch.setattr("alen.aircraft.time.time", lambda: 100.0)

    provider.nearby(55.8600, -4.2500, radius_nm=217.0)
    provider.nearby(55.8610, -4.2490, radius_nm=217.0)

    assert len(calls) == 1
    assert calls[0][2] == 240
    assert provider.last_diagnostics["cell_degrees"] == 0.25


def test_max_aircraft_radius_still_quantizes_observer(monkeypatch) -> None:
    cache = SharedCache(namespace="test-max-aircraft-radar")
    provider = AircraftProvider(cache=cache)
    calls: list[tuple[float, float, int]] = []

    def fake_fetch(lat: float, lon: float, radius_nm: int):
        calls.append((lat, lon, radius_nm))
        return {"fetched_at": 200.0, "ac": []}

    monkeypatch.setattr(provider, "_fetch_snapshot", fake_fetch)
    monkeypatch.setattr("alen.aircraft.time.time", lambda: 200.0)

    provider.nearby(55.8600, -4.2500, radius_nm=250.0)
    provider.nearby(55.8610, -4.2490, radius_nm=250.0)

    assert len(calls) == 1
    assert calls[0][2] == 250
    assert provider.last_diagnostics["cell_degrees"] == 0.05
