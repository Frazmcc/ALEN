from __future__ import annotations

import re
import time

import httpx


class AircraftRouteProvider:
    BASE_URL = "https://vrs-standing-data.adsb.lol/routes"
    CACHE_TTL_SECONDS = 3600

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, dict[str, object] | None]] = {}

    def lookup(self, callsign: str) -> dict[str, object] | None:
        normalized = re.sub(r"[^A-Z0-9]", "", callsign.upper())
        if len(normalized) < 3:
            return None

        now = time.monotonic()
        cached = self._cache.get(normalized)
        if cached and now - cached[0] < self.CACHE_TTL_SECONDS:
            return cached[1]

        url = f"{self.BASE_URL}/{normalized[:2]}/{normalized}.json"
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(url)
                if response.status_code == 404:
                    result = None
                else:
                    response.raise_for_status()
                    payload = response.json()
                    result = self._parse(payload)
        except (httpx.HTTPError, ValueError):
            result = None

        self._cache[normalized] = (now, result)
        return result

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
