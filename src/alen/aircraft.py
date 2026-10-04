from __future__ import annotations

import math

import httpx


class AircraftProvider:
    BASE_URL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{radius_nm}"

    def nearby(
        self,
        latitude_deg: float,
        longitude_deg: float,
        *,
        radius_nm: float = 43.4488,
        limit: int = 450,
    ) -> list[dict[str, object]]:
        url = self.BASE_URL.format(
            lat=f"{latitude_deg:.4f}",
            lon=f"{longitude_deg:.4f}",
            radius_nm=str(max(1, min(250, math.ceil(radius_nm)))),
        )
        try:
            with httpx.Client(
                timeout=20.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(url)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return []

        records = payload.get("ac") if isinstance(payload, dict) else None
        if not isinstance(records, list):
            return []

        found: list[dict[str, object]] = []
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

            found.append(
                {
                    "hex": str(aircraft.get("hex") or "").strip(),
                    "flight": str(aircraft.get("flight") or "").strip(),
                    "operator": str(aircraft.get("ownOp") or "").strip(),
                    "squawk": str(aircraft.get("squawk") or "").strip().zfill(4) if aircraft.get("squawk") is not None else "",
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
                    "seen": aircraft.get("seen"),
                    "distance_km": round(distance_km, 2),
                }
            )
            if len(found) >= max(1, min(int(limit), 500)):
                break
        return found


def _great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0088
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return radius_km * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
