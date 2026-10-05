from __future__ import annotations

# Production rerun marker: tuned aircraft cache second pass

import argparse
import asyncio
import json
import math
import statistics
import time
from dataclasses import dataclass

import httpx


@dataclass
class Result:
    endpoint: str
    status: int | None
    elapsed_ms: float
    error: str | None


def percentile(values: list[float], q: float) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


async def one_request(
    client: httpx.AsyncClient,
    endpoint: str,
    params: dict[str, str],
    start: asyncio.Event,
) -> Result:
    await start.wait()
    began = time.perf_counter()
    try:
        response = await client.get(endpoint, params=params)
        elapsed_ms = (time.perf_counter() - began) * 1000
        return Result(
            endpoint=endpoint,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
            error=None if response.is_success else response.text[:240],
        )
    except Exception as exc:
        return Result(
            endpoint=endpoint,
            status=None,
            elapsed_ms=(time.perf_counter() - began) * 1000,
            error=f"{type(exc).__name__}: {exc}",
        )


async def burst(
    client: httpx.AsyncClient,
    *,
    endpoint: str,
    params: dict[str, str],
    users: int,
) -> list[Result]:
    start = asyncio.Event()
    tasks = [
        asyncio.create_task(one_request(client, endpoint, params, start))
        for _ in range(users)
    ]
    await asyncio.sleep(0.1)
    start.set()
    return await asyncio.gather(*tasks)


def summarize(name: str, results: list[Result]) -> dict[str, object]:
    latencies = [r.elapsed_ms for r in results]
    failures = [r for r in results if r.status != 200]
    return {
        "name": name,
        "requests": len(results),
        "successes": len(results) - len(failures),
        "failures": len(failures),
        "p50_ms": round(percentile(latencies, 0.50), 1),
        "p95_ms": round(percentile(latencies, 0.95), 1),
        "p99_ms": round(percentile(latencies, 0.99), 1),
        "max_ms": round(max(latencies), 1) if latencies else None,
        "mean_ms": round(statistics.fmean(latencies), 1) if latencies else None,
        "sample_errors": [r.error for r in failures[:3] if r.error],
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://alen-api-lquw.onrender.com")
    parser.add_argument("--users", type=int, default=100)
    parser.add_argument("--p95-limit-ms", type=float, default=5000.0)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    limits = httpx.Limits(max_connections=max(120, args.users + 10), max_keepalive_connections=120)
    timeout = httpx.Timeout(12.0, connect=8.0)

    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        limits=limits,
        headers={"User-Agent": "ALEN-load-smoke/1.0"},
        http2=True,
    ) as client:
        health = await client.get("/api/v1/health")
        health.raise_for_status()

        satellite_params = {
            "lat": "55.7705",
            "lon": "-4.0913",
            "altitude_m": "50",
            "groups": "stations,visual",
            "limit": "100",
        }
        aircraft_params = {
            "lat": "55.7705",
            "lon": "-4.0913",
            "radius_nm": "43.4488",
            "limit": "450",
        }

        # Warm shared caches so the load phase measures ALEN serving many users,
        # not a deliberate upstream stampede.
        sat_warm = await client.get("/api/v1/satellites", params=satellite_params)
        sat_warm.raise_for_status()
        aircraft_warm = await client.get("/api/v1/aircraft", params=aircraft_params)
        aircraft_warm.raise_for_status()

        satellite_results = await burst(
            client,
            endpoint="/api/v1/satellites",
            params=satellite_params,
            users=args.users,
        )
        aircraft_results = await burst(
            client,
            endpoint="/api/v1/aircraft",
            params=aircraft_params,
            users=args.users,
        )

    report = {
        "base_url": base_url,
        "simulated_users": args.users,
        "satellites": summarize("satellites", satellite_results),
        "aircraft": summarize("aircraft", aircraft_results),
    }
    print(json.dumps(report, indent=2))

    failed = False
    for section in ("satellites", "aircraft"):
        summary = report[section]
        if int(summary["failures"]) > 0:
            failed = True
        p95 = float(summary["p95_ms"])
        if math.isfinite(p95) and p95 > args.p95_limit_ms:
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
