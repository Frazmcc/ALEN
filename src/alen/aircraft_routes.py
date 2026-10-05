from __future__ import annotations

import re

import httpx

from .cache import SharedCache, shared_cache


class AircraftRouteProvider:
    BASE_URL = "https://vrs-standing-data.adsb.lol/routes"
    CACHE_TTL_SECONDS = 21600
    REFRESH_LOCK_SECONDS = 8

    def __init__(self, cache: SharedCache | None = None) -> None:
        self._cache = cache or shared_cache

    def lookup(self, callsign: str) -> dict[str, object] | None:
        normalized = re.sub(r"[^A-Z0-9]", "", callsign.upper())
        if len(normalized) < 3:
            return None

        key = f"aircraft-route:{normalized}"
        cached = self._cache.get_json(key)
        if isinstance(cached, dict) and "found" in cached:
            value = cached.get("value")
            return value if isinstance(value, dict) else None

        token = self._cache.acquire_lock(key, ttl_seconds=self.REFRESH_LOCK_SECONDS)
        if token is None:
            # Another user is already fetching this callsign. Give that request
            # a brief chance to populate the shared cache rather than duplicating
            # the upstream lookup.
            import time

            for _ in range(10):
                time.sleep(0.05)
                cached = self._cache.get_json(key)
                if isinstance(cached, dict) and "found" in cached:
                    value = cached.get("value")
                    return value if isinstance(value, dict) else None
            return None

        try:
            result = self._fetch(normalized)
            self._cache.set_json(
                key,
                {"found": result is not None, "value": result},
                ttl_seconds=self.CACHE_TTL_SECONDS,
            )
            return result
        finally:
            self._cache.release_lock(key, token)

    def _fetch(self, normalized: str) -> dict[str, object] | None:
        url = f"{self.BASE_URL}/{normalized[:2]}/{normalized}.json"
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(url)
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        return self._parse(payload)

    @staticmethod
    def _parse(payload: object) -> dict[str, object] | None:
        if not isinstance(payload, dict):
            return None
        airports = payload.get("_airports")
        if not isinstance(airports, list) or not airports:
            return None

        valid = [airport for airport in airports if isinstance(airport, dict)]
        if not valid:
            return None

        def clean(airport: dict[str, object]) -> dict[str, object]:
            return {
                "name": str(airport.get("name") or "").strip(),
                "iata": str(airport.get("iata") or "").strip(),
                "icao": str(airport.get("icao") or "").strip(),
                "location": str(airport.get("location") or "").strip(),
                "country": str(airport.get("countryiso2") or "").strip(),
            }

        return {
            "callsign": str(payload.get("callsign") or "").strip(),
            "airline_code": str(payload.get("airline_code") or "").strip(),
            "departure": clean(valid[0]),
            "arrival": clean(valid[-1]),
            "via": [clean(airport) for airport in valid[1:-1]],
            "source": "ADSB.lol VRS standing data",
        }
