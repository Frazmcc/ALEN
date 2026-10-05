from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from time import time

import httpx
from sgp4 import omm
from sgp4.api import Satrec, WGS72, jday


@dataclass(frozen=True, slots=True)
class OrbitRecord:
    name: str
    norad: int
    international_id: str
    satellite: Satrec


class SatelliteProvider:
    BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"
    FALLBACK_URL = "https://tle.ivanstanojevic.me/api/tle"
    ORBITALWIKI_URL = "https://www.orbitalwiki.com/api/v1/elements"
    SATVISOR_MIRROR_URL = "https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak/json/{group}.json"
    CACHE_SECONDS = 1800
    MAX_CACHE_GROUPS = 16
    ALLOWED_GROUPS = frozenset(
        {
            "last-30-days",
            "stations",
            "visual",
            "starlink",
            "oneweb",
            "kuiper",
            "gnss",
            "weather",
            "earth-resources",
            "science",
            "amateur",
            "geo",
            "military",
            "cubesat",
            "fengyun-1c-debris",
            "iridium-33-debris",
            "cosmos-2251-debris",
            "cosmos-1408-debris",
        }
    )

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, tuple[OrbitRecord, ...]]] = {}
        self._lock = Lock()
        self._executor = ThreadPoolExecutor(max_workers=6, thread_name_prefix="alen-sat")
        self._group_locks = {group: Lock() for group in self.ALLOWED_GROUPS}
        self._fallback_lock = Lock()
        self.last_diagnostics: dict[str, object] = {}

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
        requested_groups = [
            group
            for group in dict.fromkeys(groups)
            if group in self.ALLOWED_GROUPS
        ][:12]
        loaded_by_group: dict[str, int] = {group: 0 for group in requested_groups}
        records_by_group: dict[str, tuple[OrbitRecord, ...]] = {}
        if requested_groups:
            futures = {
                self._executor.submit(self._load_group, group): group
                for group in requested_groups
            }
            for future in as_completed(futures):
                group = futures[future]
                try:
                    records_by_group[group] = future.result()
                except Exception:
                    records_by_group[group] = ()

        for group in requested_groups:
            records = records_by_group.get(group, ())
            loaded_by_group[group] = len(records)
            for record in records:
                satnum = record.norad
                prior = merged.get(satnum)
                if prior is None:
                    merged[satnum] = (record, {group})
                else:
                    prior[1].add(group)

        fallback_used = False
        if not merged:
            fallback_records = self._load_fallback_catalog()
            if fallback_records:
                fallback_used = True
                loaded_by_group["public-fallback"] = len(fallback_records)
                for record in fallback_records:
                    merged[record.norad] = (record, {"visual"})

        visible: list[dict[str, object]] = []
        propagated = 0
        propagation_failures = 0
        below_horizon = 0
        for satnum, (record, memberships) in merged.items():
            position = _topocentric_from_tle(
                record,
                now,
                latitude_deg,
                longitude_deg,
                altitude_m,
            )
            if position is None:
                propagation_failures += 1
                continue
            propagated += 1
            if position["elevation_deg"] < 0.0:
                below_horizon += 1
                continue
            future_position = _topocentric_from_tle(
                record,
                now + timedelta(seconds=2),
                latitude_deg,
                longitude_deg,
                altitude_m,
            ) or position
            future_position_2 = _topocentric_from_tle(
                record,
                now + timedelta(seconds=4),
                latitude_deg,
                longitude_deg,
                altitude_m,
            ) or future_position
            visible.append(
                {
                    "norad": satnum,
                    "name": record.name,
                    "international_id": record.international_id or "—",
                    "azimuth_deg": round(position["azimuth_deg"], 3),
                    "elevation_deg": round(position["elevation_deg"], 3),
                    "range_km": round(position["range_km"], 1),
                    "azimuth_deg_next": round(future_position["azimuth_deg"], 3),
                    "elevation_deg_next": round(future_position["elevation_deg"], 3),
                    "range_km_next": round(future_position["range_km"], 1),
                    "azimuth_deg_next2": round(future_position_2["azimuth_deg"], 3),
                    "elevation_deg_next2": round(future_position_2["elevation_deg"], 3),
                    "range_km_next2": round(future_position_2["range_km"], 1),
                    "motion_horizon_seconds": 2,
                    "groups": sorted(memberships),
                }
            )

        visible.sort(key=lambda item: float(item["elevation_deg"]), reverse=True)
        self.last_diagnostics = {
            "requested_groups": requested_groups,
            "loaded_by_group": loaded_by_group,
            "unique_orbits": len(merged),
            "propagated": propagated,
            "propagation_failures": propagation_failures,
            "below_horizon": below_horizon,
            "visible": len(visible),
            "fallback_used": fallback_used,
            "generated_at": now.isoformat(),
        }
        return visible[: max(1, min(int(limit), 500))]

    def _load_group(self, group: str) -> tuple[OrbitRecord, ...]:
        if group not in self.ALLOWED_GROUPS:
            return ()

        now = time()
        with self._lock:
            cached = self._cache.get(group)
        if cached and now - cached[0] < self.CACHE_SECONDS:
            return cached[1]

        # Coalesce simultaneous refreshes for the same large catalog. Without
        # this, several user requests arriving at expiry can each allocate and
        # parse a full Starlink catalog at the same time.
        with self._group_locks[group]:
            now = time()
            with self._lock:
                cached = self._cache.get(group)
            if cached and now - cached[0] < self.CACHE_SECONDS:
                return cached[1]

            records = self._fetch_group(group)
            if records:
                self._store_cache(group, records)
                return records
            return cached[1] if cached else ()

    def _load_fallback_catalog(self) -> tuple[OrbitRecord, ...]:
        key = "__public_fallback__"
        now = time()
        with self._lock:
            cached = self._cache.get(key)
        if cached and now - cached[0] < self.CACHE_SECONDS:
            return cached[1]

        with self._fallback_lock:
            now = time()
            with self._lock:
                cached = self._cache.get(key)
            if cached and now - cached[0] < self.CACHE_SECONDS:
                return cached[1]

            records = self._fetch_fallback_catalog()
            if not records:
                records = self._fetch_orbitalwiki_catalog()
            if records:
                self._store_cache(key, records)
                return records
            return cached[1] if cached else ()

    def _store_cache(self, key: str, records: tuple[OrbitRecord, ...]) -> None:
        now = time()
        with self._lock:
            expired = [
                name
                for name, (created_at, _) in self._cache.items()
                if now - created_at >= self.CACHE_SECONDS
            ]
            for name in expired:
                self._cache.pop(name, None)
            self._cache[key] = (now, records)
            while len(self._cache) > self.MAX_CACHE_GROUPS:
                oldest = min(self._cache, key=lambda name: self._cache[name][0])
                if oldest == key and len(self._cache) > 1:
                    candidates = [name for name in self._cache if name != key]
                    oldest = min(candidates, key=lambda name: self._cache[name][0])
                self._cache.pop(oldest, None)

    def _fetch_fallback_catalog(self) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(
                    self.FALLBACK_URL,
                    params={"page": "1", "page-size": "100", "sort": "popularity"},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return ()

        members = payload.get("member") if isinstance(payload, dict) else None
        if not isinstance(members, list):
            return ()

        records: list[OrbitRecord] = []
        for item in members:
            if not isinstance(item, dict):
                continue
            try:
                norad = int(item["satelliteId"])
                line1 = str(item["line1"]).strip()
                line2 = str(item["line2"]).strip()
                satellite = Satrec.twoline2rv(line1, line2)
            except (KeyError, TypeError, ValueError):
                continue
            if not line1.startswith("1 ") or not line2.startswith("2 "):
                continue
            records.append(
                OrbitRecord(
                    name=str(item.get("name") or f"NORAD {norad}").strip(),
                    norad=norad,
                    international_id=line1[9:17].strip(),
                    satellite=satellite,
                )
            )
        return tuple(records)

    def _fetch_orbitalwiki_catalog(self) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=15.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(self.ORBITALWIKI_URL)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return ()

        if not isinstance(payload, dict):
            return ()

        norad_values = _parallel_array(
            payload,
            "norad_cat_id",
            "norad",
            "satellite_id",
            "satelliteId",
            "id",
            "ids",
        )
        if not norad_values:
            return ()

        name_values = _parallel_array(payload, "name", "names", "object_name")
        object_id_values = _parallel_array(payload, "object_id", "cospar", "intl_des", "international_id")
        epoch_values = _parallel_array(payload, "epoch", "epochs", "date")
        mean_motion_values = _parallel_array(payload, "mean_motion", "mm", "n")
        eccentricity_values = _parallel_array(payload, "eccentricity", "ecc", "e")
        inclination_values = _parallel_array(payload, "inclination", "inc", "i")
        raan_values = _parallel_array(payload, "raan", "ra_of_asc_node")
        argp_values = _parallel_array(payload, "arg_perigee", "argp", "arg_of_pericenter")
        mean_anomaly_values = _parallel_array(payload, "mean_anomaly", "ma", "m")
        bstar_values = _parallel_array(payload, "bstar", "b_star")

        records: list[OrbitRecord] = []
        for index, raw_norad in enumerate(norad_values):
            try:
                norad = int(raw_norad)
                epoch = str(_parallel_value(epoch_values, index, ""))
                mean_motion = float(_parallel_value(mean_motion_values, index, math.nan))
                eccentricity = float(_parallel_value(eccentricity_values, index, math.nan))
                inclination = float(_parallel_value(inclination_values, index, math.nan))
                raan = float(_parallel_value(raan_values, index, math.nan))
                argp = float(_parallel_value(argp_values, index, math.nan))
                mean_anomaly = float(_parallel_value(mean_anomaly_values, index, math.nan))
                if not epoch or not all(
                    math.isfinite(value)
                    for value in (mean_motion, eccentricity, inclination, raan, argp, mean_anomaly)
                ):
                    continue
                epoch_dt = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
                if epoch_dt.tzinfo is None:
                    epoch_dt = epoch_dt.replace(tzinfo=timezone.utc)
                epoch_dt = epoch_dt.astimezone(timezone.utc)
                epoch_jd, epoch_fraction = jday(
                    epoch_dt.year,
                    epoch_dt.month,
                    epoch_dt.day,
                    epoch_dt.hour,
                    epoch_dt.minute,
                    epoch_dt.second + epoch_dt.microsecond / 1_000_000,
                )
                sgp4_epoch = epoch_jd + epoch_fraction - 2433281.5
                bstar = float(_parallel_value(bstar_values, index, 0) or 0)
                no_kozai = mean_motion * 2.0 * math.pi / 1440.0
                satellite = Satrec()
                satellite.sgp4init(
                    WGS72,
                    "i",
                    norad,
                    sgp4_epoch,
                    bstar,
                    0.0,
                    0.0,
                    eccentricity,
                    math.radians(argp),
                    math.radians(inclination),
                    math.radians(mean_anomaly),
                    no_kozai,
                    math.radians(raan),
                )
                name = str(_parallel_value(name_values, index, f"NORAD {norad}")).strip()
                international_id = str(_parallel_value(object_id_values, index, "")).strip()
            except (TypeError, ValueError, OverflowError):
                continue
            records.append(
                OrbitRecord(
                    name=name or f"NORAD {norad}",
                    norad=norad,
                    international_id=international_id,
                    satellite=satellite,
                )
            )
        return tuple(records)

    def _fetch_group(self, group: str) -> tuple[OrbitRecord, ...]:
        records = self._fetch_group_json(group)
        if records:
            return records
        records = self._fetch_group_mirror_json(group)
        if records:
            return records
        return self._fetch_group_tle(group)

    def _fetch_group_json(self, group: str) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(
                    self.BASE_URL,
                    params={"GROUP": group.upper(), "FORMAT": "JSON"},
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

    def _fetch_group_mirror_json(self, group: str) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=8.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"},
            ) as client:
                response = client.get(
                    self.SATVISOR_MIRROR_URL.format(group=group.lower())
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

    def _fetch_group_tle(self, group: str) -> tuple[OrbitRecord, ...]:
        try:
            with httpx.Client(
                timeout=10.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "text/plain"},
            ) as client:
                response = client.get(
                    self.BASE_URL,
                    params={"GROUP": group.upper(), "FORMAT": "TLE"},
                )
                response.raise_for_status()
                lines = [line.strip() for line in response.text.splitlines() if line.strip()]
        except httpx.HTTPError:
            return ()

        records: list[OrbitRecord] = []
        index = 0
        while index < len(lines):
            if lines[index].startswith("1 ") and index + 1 < len(lines) and lines[index + 1].startswith("2 "):
                name = ""
                line1, line2 = lines[index], lines[index + 1]
                index += 2
            elif (
                index + 2 < len(lines)
                and lines[index + 1].startswith("1 ")
                and lines[index + 2].startswith("2 ")
            ):
                name, line1, line2 = lines[index], lines[index + 1], lines[index + 2]
                index += 3
            else:
                index += 1
                continue

            try:
                satellite = Satrec.twoline2rv(line1, line2)
                norad = int(line1[2:7])
            except (TypeError, ValueError):
                continue
            international_id = line1[9:17].strip()
            records.append(
                OrbitRecord(
                    name=name or f"NORAD {norad}",
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


def _parallel_array(payload: dict[str, object], *aliases: str) -> list[object]:
    containers = [payload]
    for key in ("data", "elements", "arrays"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            containers.append(nested)
    for container in containers:
        for alias in aliases:
            value = container.get(alias)
            if isinstance(value, list):
                return value
    return []


def _parallel_value(values: list[object], index: int, default: object) -> object:
    return values[index] if index < len(values) and values[index] is not None else default
