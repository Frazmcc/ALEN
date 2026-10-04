from __future__ import annotations

from datetime import UTC, datetime
import logging

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .aircraft import AircraftProvider
from .aircraft_photos import AircraftPhotoProvider
from .airports import AirportProvider
from .satellites import SatelliteProvider

app = FastAPI(
    title="ALEN API",
    version=__version__,
    description="Backend services for Astronomical Live Environment & Navigation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://frazmcc.github.io", "https://alen.observer"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)

_aircraft = AircraftProvider()
_aircraft_photos = AircraftPhotoProvider()
_airports = AirportProvider()
_satellites = SatelliteProvider()
_logger = logging.getLogger("alen.satellites")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "name": "ALEN",
        "version": __version__,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/api/v1/airports")
def nearby_airports(
    lat: float = Query(ge=-90.0, le=90.0),
    lon: float = Query(ge=-180.0, le=180.0),
    radius_km: float = Query(default=180.0, ge=20.0, le=400.0),
    limit: int = Query(default=14, ge=1, le=30),
) -> dict[str, object]:
    return {
        "airports": _airports.nearby(
            lat,
            lon,
            max_distance_km=radius_km,
            limit=limit,
        )
    }


@app.get("/api/v1/satellites")
def visible_satellites(
    lat: float = Query(ge=-90.0, le=90.0),
    lon: float = Query(ge=-180.0, le=180.0),
    altitude_m: float = Query(default=0.0, ge=-500.0, le=20000.0),
    groups: str = Query(default="last-30-days,stations,visual"),
    limit: int = Query(default=260, ge=1, le=500),
) -> dict[str, object]:
    requested = [value.strip() for value in groups.split(",") if value.strip()]
    requested = requested[:12]
    satellites = _satellites.visible(
        lat,
        lon,
        altitude_m,
        requested,
        limit=limit,
    )
    diagnostics = _satellites.last_diagnostics
    if not satellites:
        _logger.warning("Satellite request returned no visible objects: %s", diagnostics)
    return {
        "satellites": satellites,
        "diagnostics": diagnostics,
    }


@app.get("/api/v1/aircraft")
def nearby_aircraft(
    lat: float = Query(ge=-90.0, le=90.0),
    lon: float = Query(ge=-180.0, le=180.0),
    radius_nm: float = Query(default=43.4488, ge=1.0, le=250.0),
    limit: int = Query(default=450, ge=1, le=500),
) -> dict[str, object]:
    return {
        "aircraft": _aircraft.nearby(
            lat,
            lon,
            radius_nm=radius_nm,
            limit=limit,
        )
    }


@app.get("/api/v1/aircraft/photo")
def aircraft_photo(
    registration: str = Query(default="", max_length=32),
    aircraft_type: str = Query(default="", max_length=64),
) -> dict[str, object]:
    photo = _aircraft_photos.find(registration, aircraft_type)
    if photo is None:
        return {"photo": None}
    return {
        "photo": {
            "image_url": photo.image_url,
            "source_url": photo.source_url,
            "title": photo.title,
            "artist": photo.artist,
            "license": photo.license_name,
            "match": photo.match,
            "planespotters_url": photo.planespotters_url,
        }
    }
