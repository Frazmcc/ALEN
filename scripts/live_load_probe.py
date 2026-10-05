from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
import json
import math
import statistics
import time
from urllib.parse import urlencode

import httpx


DEFAULT_LOCATIONS = (
    (55.8600, -4.2500),
    (55.8610, -4.2490),
    (55.8620, -4.2480),
    (55.8630, -4.2470),
    (55.8640, -4.2460),
)


@dataclass
class Result:
    kind: str
    status: int
    latency_ms: float
    cache_state: str
    bytes_received: int


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * p) - 1))
    return ordered[index]


def build_urls(base_url: str, lat: float, lon: float) -> tuple[str, str]:
    aircraft = base_url.rstrip("/") + "/api/v1/aircraft?" + urlencode(
        {
            "lat": f"{lat:.6f}",
            "lon": f"{lon:.6f}",
            "radius_nm": "43.4488",
            "limit": "450",
        }
    )
    satellites = base_url.rstrip("/") + "/api/v1/satellites?" + urlencode(
        {
            "lat": f"{lat:.6f}",
            "lon": f"{lon:.6f}",
            "altitude_m": "0",
            "groups": "last-30-days,stations,visual,starlink",
            "limit": "320",
        }
    )
    return aircraft, satellites


def raw_download_size(client: httpx.Client, url: str, encoding: str) -> tuple[int, str]:
    with client.stream("GET", url, headers={"Accept-Encoding": encoding}) as response:
        response.raise_for_status()
        raw = b"".join(response.iter_raw())
        return len(raw), response.headers.get("content-encoding", "")


async def fetch_one(client: httpx.AsyncClient, kind: str, url: str) -> Result:
    started = time.perf_counter()
    try:
        response = await client.get(url, headers={"Accept-Encoding": "gzip"})
        latency_ms = (time.perf_counter() - started) * 1000
        status = response.status_code
        cache_state = ""
        if status == 200:
            payload = response.json()
            diagnostics = payload.get("diagnostics") if isinstance(payload, dict) else None
            if isinstance(diagnostics, dict):
                if kind == "aircraft":
                    cache_state = str(diagnostics.get("cache") or "")
                else:
                    cache_state = str(diagnostics.get("observer_cache") or "")
        return Result(
            kind=kind,
            status=status,
            latency_ms=latency_ms,
            cache_state=cache_state,
            bytes_received=len(response.content),
        )
    except Exception:
        return Result(
            kind=kind,
            status=0,
            latency_ms=(time.perf_counter() - started) * 1000,
            cache_state="exception",
            bytes_received=0,
        )


async def warm(client: httpx.AsyncClient, base_url: str) -> None:
    aircraft, satellites = build_urls(base_url, *DEFAULT_LOCATIONS[0])
    for url in (aircraft, satellites):
        response = await client.get(url, headers={"Accept-Encoding": "gzip"})
        response.raise_for_status()


async def run_wave(
    client: httpx.AsyncClient,
    base_url: str,
    users: int,
) -> list[Result]:
    tasks: list[asyncio.Task[Result]] = []
    for user in range(users):
        lat, lon = DEFAULT_LOCATIONS[user % len(DEFAULT_LOCATIONS)]
        aircraft, satellites = build_urls(base_url, lat, lon)
        tasks.append(asyncio.create_task(fetch_one(client, "aircraft", aircraft)))
        tasks.append(asyncio.create_task(fetch_one(client, "satellites", satellites)))
    return await asyncio.gather(*tasks)


def summarize_wave(users: int, results: list[Result]) -> dict[str, object]:
    summary: dict[str, object] = {"users": users, "requests": len(results)}
    for kind in ("aircraft", "satellites"):
        subset = [item for item in results if item.kind == kind]
        latencies = [item.latency_ms for item in subset]
        ok = [item for item in subset if item.status == 200]
        cache_hits = 0
        for item in ok:
            if kind == "aircraft":
                cache_hits += item.cache_state in {"fresh", "stale", "coalesced"}
            else:
                cache_hits += item.cache_state == "hit"
        summary[kind] = {
            "success": len(ok),
            "errors": len(subset) - len(ok),
            "p50_ms": round(percentile(latencies, 0.50), 1),
            "p95_ms": round(percentile(latencies, 0.95), 1),
            "max_ms": round(max(latencies, default=0.0), 1),
            "cache_hit_ratio": round(cache_hits / len(ok), 3) if ok else 0.0,
        }
    return summary


async def main_async(args: argparse.Namespace) -> int:
    timeout = httpx.Timeout(args.timeout)
    limits = httpx.Limits(max_connections=240, max_keepalive_connections=120)
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=True) as client:
        health = await client.get(args.base_url.rstrip("/") + "/api/v1/health")
        health.raise_for_status()
        print("HEALTH", json.dumps(health.json(), sort_keys=True))

        await warm(client, args.base_url)

        sample_aircraft, sample_satellites = build_urls(args.base_url, *DEFAULT_LOCATIONS[0])
        with httpx.Client(timeout=args.timeout, follow_redirects=True) as sync_client:
            compression = {}
            for kind, url in (("aircraft", sample_aircraft), ("satellites", sample_satellites)):
                identity_size, identity_encoding = raw_download_size(sync_client, url, "identity")
                gzip_size, gzip_encoding = raw_download_size(sync_client, url, "gzip")
                ratio = gzip_size / identity_size if identity_size else 1.0
                compression[kind] = {
                    "identity_bytes": identity_size,
                    "gzip_bytes": gzip_size,
                    "ratio": round(ratio, 3),
                    "content_encoding": gzip_encoding,
                    "identity_encoding": identity_encoding,
                }
            print("COMPRESSION", json.dumps(compression, sort_keys=True))

        all_summaries = []
        exit_code = 0
        for users in args.waves:
            await warm(client, args.base_url)
            started = time.perf_counter()
            results = await run_wave(client, args.base_url, users)
            elapsed_ms = (time.perf_counter() - started) * 1000
            summary = summarize_wave(users, results)
            summary["wave_elapsed_ms"] = round(elapsed_ms, 1)
            all_summaries.append(summary)
            print("WAVE", json.dumps(summary, sort_keys=True))

            for kind in ("aircraft", "satellites"):
                metrics = summary[kind]
                if metrics["errors"] > 0:
                    exit_code = 1
                if metrics["p95_ms"] > args.max_p95_ms:
                    exit_code = 1
            await asyncio.sleep(2)

        sat_compression = compression["satellites"]
        if sat_compression["content_encoding"] != "gzip":
            print("FAIL satellite response was not gzip encoded")
            exit_code = 1
        if sat_compression["ratio"] > args.max_compression_ratio:
            print(
                "FAIL satellite gzip ratio",
                sat_compression["ratio"],
                ">",
                args.max_compression_ratio,
            )
            exit_code = 1

        final = {
            "compression": compression,
            "waves": all_summaries,
            "passed": exit_code == 0,
        }
        print("RESULT", json.dumps(final, sort_keys=True))
        return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Controlled live concurrency probe for ALEN API")
    parser.add_argument(
        "--base-url",
        default="https://alen-api-lquw.onrender.com",
    )
    parser.add_argument(
        "--waves",
        type=int,
        nargs="+",
        default=[25, 50, 100],
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-p95-ms", type=float, default=8000.0)
    parser.add_argument("--max-compression-ratio", type=float, default=0.70)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async(parse_args())))
