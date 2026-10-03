from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from threading import Lock

import httpx


@dataclass(frozen=True, slots=True)
class Airport:
    iata: str
    icao: str
    name: str
    latitude_deg: float
    longitude_deg: float
    airport_type: str
    scheduled_service: bool


class AirportProvider:
    PRIMARY_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
    FALLBACK_URL = "https://vrs-standing-data.adsb.lol/airports.csv"

    def __init__(self) -> None:
        self._records: tuple[Airport, ...] = ()
        self._lock = Lock()

    def preload(self) -> int:
        return len(self._load_records())

    def nearby(
        self,
        latitude_deg: float,
        longitude_deg: float,
        *,
        max_distance_km: float = 180.0,
        limit: int = 14,
    ) -> list[dict[str, object]]:
        found: list[tuple[tuple[int, int, float, str], dict[str, object]]] = []
        for airport in self._load_records():
            distance = _great_circle_km(
                latitude_deg,
                longitude_deg,
                airport.latitude_deg,
                airport.longitude_deg,
            )
            if distance > max_distance_km:
                continue
            bearing = _initial_bearing_deg(
                latitude_deg,
                longitude_deg,
                airport.latitude_deg,
                airport.longitude_deg,
            )
            size = 0 if airport.airport_type == "large_airport" else 1
            priority = (size, -int(airport.scheduled_service), distance, airport.icao)
            found.append(
                (
                    priority,
                    {
                        "iata": airport.iata,
                        "icao": airport.icao,
                        "name": airport.name,
                        "latitude": airport.latitude_deg,
                        "longitude": airport.longitude_deg,
                        "distance_km": round(distance, 1),
                        "bearing_deg": round(bearing, 1),
                        "type": airport.airport_type,
                    },
                )
            )
        found.sort(key=lambda item: item[0])
        return [item for _priority, item in found[: max(0, int(limit))]]

    def _load_records(self) -> tuple[Airport, ...]:
        with self._lock:
            if self._records:
                return self._records
            records = self._fetch_primary()
            if not records:
                records = self._fetch_fallback()
            if records:
                self._records = records
            return self._records

    @staticmethod
    def _get_text(url: str) -> str | None:
        try:
            with httpx.Client(
                timeout=25.0,
                follow_redirects=True,
                headers={"User-Agent": "ALEN/0.1", "Accept": "text/csv"},
            ) as client:
                response = client.get(url)
                response.raise_for_status()
                return response.content.decode("utf-8-sig")
        except (httpx.HTTPError, UnicodeDecodeError):
            return None

    def _fetch_primary(self) -> tuple[Airport, ...]:
        text = self._get_text(self.PRIMARY_URL)
        if not text:
            return ()
        records: list[Airport] = []
        try:
            rows = csv.DictReader(io.StringIO(text))
            for row in rows:
                airport_type = (row.get("type") or "").strip().lower()
                scheduled = (row.get("scheduled_service") or "").strip().lower() == "yes"
                if airport_type not in {"large_airport", "medium_airport"}:
                    continue
                if airport_type == "medium_airport" and not scheduled:
                    continue
                iata = (row.get("iata_code") or "").strip().upper()
                icao = (row.get("ident") or row.get("gps_code") or "").strip().upper()
                name = (row.get("name") or "").strip()
                if len(icao) != 4 or not name:
                    continue
                try:
                    latitude = float(row.get("latitude_deg") or "")
                    longitude = float(row.get("longitude_deg") or "")
                except ValueError:
                    continue
                records.append(
                    Airport(
                        iata=iata if len(iata) == 3 else "",
                        icao=icao,
                        name=name,
                        latitude_deg=latitude,
                        longitude_deg=longitude,
                        airport_type=airport_type,
                        scheduled_service=scheduled,
                    )
                )
        except csv.Error:
            return ()
        return tuple(records)

    def _fetch_fallback(self) -> tuple[Airport, ...]:
        text = self._get_text(self.FALLBACK_URL)
        if not text:
            return ()
        records: list[Airport] = []
        for row in csv.DictReader(io.StringIO(text)):
            icao = (row.get("ICAO") or row.get("Code") or "").strip().upper()
            iata = (row.get("IATA") or "").strip().upper()
            name = (row.get("Name") or "").strip()
            if len(icao) != 4 or not name:
                continue
            try:
                latitude = float(row.get("Latitude") or "")
                longitude = float(row.get("Longitude") or "")
            except ValueError:
                continue
            records.append(
                Airport(
                    iata=iata if len(iata) == 3 else "",
                    icao=icao,
                    name=name,
                    latitude_deg=latitude,
                    longitude_deg=longitude,
                    airport_type="fallback",
                    scheduled_service=True,
                )
            )
        return tuple(records)


def _great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return radius_km * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _initial_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return math.degrees(math.atan2(y, x)) % 360.0
