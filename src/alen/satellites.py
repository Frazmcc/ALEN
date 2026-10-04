from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from time import time

import httpx
from sgp4 import omm
from sgp4.api import Satrec, jday


@dataclass(frozen=True, slots=True)
class OrbitRecord:
    name: str
    norad: int
    international_id: str
    satellite: Satrec


class SatelliteProvider:
    BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"
    CACHE_SECONDS = 1800

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, tuple[OrbitRecord, ...]]] = {}
        self._lock = Lock()

    def visible(
        self,
        latitude_deg: float,
        longitude_deg: float,
        altitude_m: float,
        groups: list[str],
        *,
        limit: int = 260,
    ) -> list[dict[str, object]]:
        now = datetime.now(timezone.utc)
        merged: dict[int, tuple[OrbitRecord, set[str]]] = {}
        for group in groups:
            for record in self._load_group(group):
                satnum = record.norad
                prior = merged.get(satnum)
                if prior is None:
                    merged[satnum] = (record, {group})
                else:
                    prior[1].add(group)

        visible: list[dict[str, object]] = []
        for satnum, (record, memberships) in merged.items():
            position = _topocentric_from_tle(
                record,
                now,
                latitude_deg,
                longitude_deg,
                altitude_m,
            )
            if position is None or position["elevation_deg"] < 0.0:
                continue
            visible.append(
                {
                    "norad": satnum,
                    "name": record.name,
                    "international_id": record.international_id or "—",
                    "azimuth_deg": round(position["azimuth_deg"], 3),
                    "elevation_deg": round(position["elevation_deg"], 3),
                    "range_km": round(position["range_km"], 1),
                    "groups": sorted(memberships),
                }
            )

        visible.sort(key=lambda item: float(item["elevation_deg"]), reverse=True)
        return visible[: max(1, min(int(limit), 500))]

    def _load_group(self, group: str) -> tuple[OrbitRecord, ...]:
        now = time()
        cached = self._cache.get(group)
        if cached and now - cached[0] < self.CACHE_SECONDS:
            return cached[1]

        with self._lock:
            cached = self._cache.get(group)
            if cached and now - cached[0] < self.CACHE_SECONDS:
                return cached[1]
            records = self._fetch_group(group)
            if records:
                self._cache[group] = (now, records)
                return records
            return cached[1] if cached else ()

    def _fetch_group(self, group: str) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=30.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(
                    self.BASE_URL,
                    params={"GROUP": group, "FORMAT": "JSON"},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return ()

        if not isinstance(payload, list):
            return ()

        records: list[OrbitRecord] = []
        for fields in payload:
            if not isinstance(fields, dict):
                continue
            try:
                satellite = Satrec()
                omm.initialize(satellite, fields)
                norad = int(fields["NORAD_CAT_ID"])
            except (KeyError, TypeError, ValueError):
                continue
            name = str(fields.get("OBJECT_NAME") or f"NORAD {norad}").strip()
            international_id = str(fields.get("OBJECT_ID") or "").strip()
            records.append(
                OrbitRecord(
                    name=name,
                    norad=norad,
                    international_id=international_id,
                    satellite=satellite,
                )
            )
        return tuple(records)


def _topocentric_from_tle(
    record: OrbitRecord,
    when: datetime,
    latitude_deg: float,
    longitude_deg: float,
    altitude_m: float,
) -> dict[str, float] | None:
    try:
        satellite = record.satellite
        second = when.second + when.microsecond / 1_000_000
        jd, fraction = jday(
            when.year,
            when.month,
            when.day,
            when.hour,
            when.minute,
            second,
        )
        error, teme_position, _velocity = satellite.sgp4(jd, fraction)
    except (ValueError, TypeError):
        return None
    if error != 0:
        return None

    gmst = _gmst_radians(jd + fraction)
    cos_g = math.cos(gmst)
    sin_g = math.sin(gmst)
    x_teme, y_teme, z_teme = teme_position
    x = cos_g * x_teme + sin_g * y_teme
    y = -sin_g * x_teme + cos_g * y_teme
    z = z_teme

    ox, oy, oz = _observer_ecef(latitude_deg, longitude_deg, altitude_m)
    dx, dy, dz = x - ox, y - oy, z - oz

    lat = math.radians(latitude_deg)
    lon = math.radians(longitude_deg)
    east = -math.sin(lon) * dx + math.cos(lon) * dy
    north = (
        -math.sin(lat) * math.cos(lon) * dx
        - math.sin(lat) * math.sin(lon) * dy
        + math.cos(lat) * dz
    )
    up = (
        math.cos(lat) * math.cos(lon) * dx
        + math.cos(lat) * math.sin(lon) * dy
        + math.sin(lat) * dz
    )

    range_km = math.sqrt(east * east + north * north + up * up)
    if range_km <= 0:
        return None

    azimuth = math.degrees(math.atan2(east, north)) % 360.0
    elevation = math.degrees(math.asin(max(-1.0, min(1.0, up / range_km))))
    return {
        "azimuth_deg": azimuth,
        "elevation_deg": elevation,
        "range_km": range_km,
    }


def _observer_ecef(latitude_deg: float, longitude_deg: float, altitude_m: float) -> tuple[float, float, float]:
    a = 6378.137
    e2 = 6.69437999014e-3
    lat = math.radians(latitude_deg)
    lon = math.radians(longitude_deg)
    altitude_km = altitude_m / 1000.0
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    n = a / math.sqrt(1.0 - e2 * sin_lat * sin_lat)
    x = (n + altitude_km) * cos_lat * math.cos(lon)
    y = (n + altitude_km) * cos_lat * math.sin(lon)
    z = (n * (1.0 - e2) + altitude_km) * sin_lat
    return x, y, z


def _gmst_radians(julian_date: float) -> float:
    t = (julian_date - 2451545.0) / 36525.0
    gmst_deg = (
        280.46061837
        + 360.98564736629 * (julian_date - 2451545.0)
        + 0.000387933 * t * t
        - t * t * t / 38710000.0
    )
    return math.radians(gmst_deg % 360.0)
