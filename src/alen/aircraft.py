from __future__ import annotations

import math
import time

import httpx

from .cache import shared_cache


class AircraftProvider:
    BASE_URL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{radius_nm}"

    # Live data is shared by geographic cell. One upstream request refreshes the
    # snapshot for every ALEN user in that cell.
    CELL_DEGREES = 1.0
    CELL_PADDING_NM = 50
    RADIUS_BUCKET_NM = 25
    CACHE_FRESH_SECONDS = 1.0
    CACHE_STALE_SECONDS = 20.0
    REFRESH_LOCK_SECONDS = 8

    def __init__(self) -> None:
        self.last_diagnostics: dict[str, object] = {}

    def nearby(
        self,
        latitude_deg: float,
        longitude_deg: float,
        *,
        radius_nm: float = 43.4488,
        limit: int = 450,
    ) -> list[dict[str, object]]:
        cell_lat, cell_lon = self._cell_center(latitude_deg, longitude_deg)
        radius_bucket = max(
            self.RADIUS_BUCKET_NM,
            min(
                250,
                int(math.ceil(radius_nm / self.RADIUS_BUCKET_NM) * self.RADIUS_BUCKET_NM),
            ),
        )
        upstream_radius_nm = min(250, radius_bucket + self.CELL_PADDING_NM)
        cache_key = (
            f"aircraft:{cell_lat:+06.2f}:{cell_lon:+07.2f}:r{upstream_radius_nm}"
        )

        snapshot = shared_cache.get_json(cache_key)
        now = time.time()
        age = self._snapshot_age(snapshot, now)
        cache_state = "miss"

        if isinstance(snapshot, dict) and age <= self.CACHE_FRESH_SECONDS:
            cache_state = "fresh"
        else:
            cooldown = shared_cache.get_json(f"{cache_key}:cooldown")
            lock_token = None if cooldown else shared_cache.acquire_lock(
                cache_key,
                ttl_seconds=self.REFRESH_LOCK_SECONDS,
            )
            if lock_token is not None:
                try:
                    fresh = self._fetch_snapshot(
                        cell_lat,
                        cell_lon,
                        upstream_radius_nm,
                    )
                    if fresh is not None:
                        snapshot = fresh
                        age = 0.0
                        cache_state = "refreshed"
                        shared_cache.set_json(
                            cache_key,
                            fresh,
                            ttl_seconds=self.CACHE_STALE_SECONDS,
                        )
                    elif isinstance(snapshot, dict):
                        cache_state = "stale"
                    else:
                        cache_state = "unavailable"
                finally:
                    shared_cache.release_lock(cache_key, lock_token)
            elif isinstance(snapshot, dict):
                cache_state = "stale"
            else:
                # Another request may be doing the first population. Wait only
                # briefly; this path occurs on cold start rather than every poll.
                for _ in range(10):
                    time.sleep(0.05)
                    candidate = shared_cache.get_json(cache_key)
                    if isinstance(candidate, dict):
                        snapshot = candidate
                        age = self._snapshot_age(snapshot, time.time())
                        cache_state = "coalesced"
                        break

        records = snapshot.get("ac") if isinstance(snapshot, dict) else None
        if not isinstance(records, list):
            records = []

        found: list[dict[str, object]] = []
        cache_age_seconds = max(0.0, age if math.isfinite(age) else 0.0)
        for aircraft in records:
            if not isinstance(aircraft, dict):
                continue
            try:
                lat = float(aircraft["lat"])
                lon = float(aircraft["lon"])
            except (KeyError, TypeError, ValueError):
                continue

            distance_km = _great_circle_km(latitude_deg, longitude_deg, lat, lon)
            if distance_km > radius_nm * 1.852:
                continue

            try:
                source_seen = float(aircraft.get("seen") or 0.0)
            except (TypeError, ValueError):
                source_seen = 0.0

            found.append(
                {
                    "hex": str(aircraft.get("hex") or "").strip(),
                    "flight": str(aircraft.get("flight") or "").strip(),
                    "operator": str(aircraft.get("ownOp") or "").strip(),
                    "squawk": (
                        str(aircraft.get("squawk") or "").strip().zfill(4)
                        if aircraft.get("squawk") is not None
                        else ""
                    ),
                    "db_flags": int(aircraft.get("dbFlags") or 0),
                    "registration": str(aircraft.get("r") or "").strip(),
                    "type": str(aircraft.get("t") or "Aircraft").strip(),
                    "category": str(aircraft.get("category") or "").strip().upper(),
                    "lat": lat,
                    "lon": lon,
                    "alt_baro": aircraft.get("alt_baro"),
                    "alt_geom": aircraft.get("alt_geom"),
                    "gs": aircraft.get("gs"),
                    "track": aircraft.get("track"),
                    # Include shared-cache age so the browser projects from the
                    # measurement time rather than visually jumping backwards.
                    "seen": source_seen + cache_age_seconds,
                    "distance_km": round(distance_km, 2),
                }
            )
            if len(found) >= max(1, min(int(limit), 500)):
                break

        self.last_diagnostics = {
            "cache": cache_state,
            "cache_age_seconds": round(cache_age_seconds, 3),
            "shared_cache": shared_cache.distributed,
            "cell": [cell_lat, cell_lon],
            "upstream_radius_nm": upstream_radius_nm,
            "returned": len(found),
        }
        return found

    def _fetch_snapshot(
        self,
        latitude_deg: float,
        longitude_deg: float,
        radius_nm: int,
    ) -> dict[str, object] | None:
        url = self.BASE_URL.format(
            lat=f"{latitude_deg:.4f}",
            lon=f"{longitude_deg:.4f}",
            radius_nm=str(max(1, min(250, int(radius_nm)))),
        )
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (+https://alen.observer)",
                    "Accept": "application/json",
                },
            ) as client:
                response = client.get(url)

                if 400 <= response.status_code < 500:
                    retry_after = 10
                    if response.status_code == 429:
                        try:
                            retry_after = max(
                                2,
                                min(60, int(response.headers.get("Retry-After", "10"))),
                            )
                        except ValueError:
                            retry_after = 10
                    shared_cache.set_json(
                        self._cooldown_key(latitude_deg, longitude_deg, radius_nm),
                        {"status": response.status_code},
                        ttl_seconds=retry_after,
                    )
                    return None

                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None

        records = payload.get("ac") if isinstance(payload, dict) else None
        if not isinstance(records, list):
            return None
        return {
            "fetched_at": time.time(),
            "ac": records,
        }

    @classmethod
    def _cell_center(cls, latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
        size = cls.CELL_DEGREES
        lat_index = math.floor((latitude_deg + 90.0) / size)
        lon_index = math.floor((longitude_deg + 180.0) / size)
        lat = -90.0 + (lat_index + 0.5) * size
        lon = -180.0 + (lon_index + 0.5) * size
        return (
            round(max(-89.5, min(89.5, lat)), 4),
            round(((lon + 180.0) % 360.0) - 180.0, 4),
        )

    @staticmethod
    def _snapshot_age(snapshot: object, now: float) -> float:
        if not isinstance(snapshot, dict):
            return math.inf
        try:
            return max(0.0, now - float(snapshot["fetched_at"]))
        except (KeyError, TypeError, ValueError):
            return math.inf

    @staticmethod
    def _cooldown_key(latitude_deg: float, longitude_deg: float, radius_nm: int) -> str:
        return (
            f"aircraft:{latitude_deg:+06.2f}:{longitude_deg:+07.2f}:"
            f"r{radius_nm}:cooldown"
        )


def _great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0088
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return radius_km * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
