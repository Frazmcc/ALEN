from __future__ import annotations

from datetime import UTC, datetime
import logging
import math
from time import time as unix_time
from urllib.parse import urlencode

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from . import __version__
from .aircraft import AircraftProvider
from .aircraft_photos import AircraftPhotoProvider
from .aircraft_routes import AircraftRouteProvider
from .airports import AirportProvider
from .cache import shared_cache
from .satellites import SatelliteProvider
from .satellite_info import SatelliteInfoProvider

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

app.add_middleware(
    GZipMiddleware,
    minimum_size=1024,
    compresslevel=5,
)

_aircraft = AircraftProvider()
_aircraft_photos = AircraftPhotoProvider()
_aircraft_routes = AircraftRouteProvider()
_airports = AirportProvider()
_satellites = SatelliteProvider()
_satellite_info = SatelliteInfoProvider()
_logger = logging.getLogger("alen.satellites")

SATELLITE_OBSERVER_CACHE_SECONDS = 8
SATELLITE_OBSERVER_CELL_DEGREES = 0.005
SATELLITE_OBSERVER_ALTITUDE_BUCKET_M = 100


def _satellite_observer_cell(value: float, minimum: float, maximum: float) -> float:
    cell = SATELLITE_OBSERVER_CELL_DEGREES
    index = math.floor((value - minimum) / cell)
    center = minimum + (index + 0.5) * cell
    return round(max(minimum, min(maximum, center)), 4)


def _satellite_observer_cache_key(
    latitude_deg: float,
    longitude_deg: float,
    altitude_m: float,
    groups: list[str],
    limit: int,
) -> str:
    latitude = _satellite_observer_cell(latitude_deg, -90.0, 90.0)
    longitude = _satellite_observer_cell(longitude_deg, -180.0, 180.0)
    altitude = int(
        round(altitude_m / SATELLITE_OBSERVER_ALTITUDE_BUCKET_M)
        * SATELLITE_OBSERVER_ALTITUDE_BUCKET_M
    )
    group_key = ",".join(sorted(set(groups)))
    return (
        f"satellite-observer:v2:{latitude:.4f}:{longitude:.4f}:"
        f"{altitude}:{limit}:{group_key}"
    )


def _satellite_cached_response(cache_key: str) -> dict[str, object] | None:
    snapshot = shared_cache.get_json(cache_key)
    if not isinstance(snapshot, dict):
        return None
    satellites = snapshot.get("satellites")
    diagnostics = snapshot.get("diagnostics")
    if not isinstance(satellites, list) or not isinstance(diagnostics, dict):
        return None

    try:
        cache_age = max(0.0, unix_time() - float(snapshot.get("cached_at") or 0.0))
    except (TypeError, ValueError):
        cache_age = 0.0

    adjusted_diagnostics = dict(diagnostics)
    try:
        sample_age = float(adjusted_diagnostics.get("position_sample_age_seconds") or 0.0)
    except (TypeError, ValueError):
        sample_age = 0.0
    adjusted_diagnostics["position_sample_age_seconds"] = round(sample_age + cache_age, 3)
    adjusted_diagnostics["observer_cache"] = "hit"
    adjusted_diagnostics["observer_cache_age_seconds"] = round(cache_age, 3)
    return {
        "satellites": satellites,
        "diagnostics": adjusted_diagnostics,
    }



@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "name": "ALEN",
        "version": __version__,
        "cache": "redis" if shared_cache.distributed else "local",
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
    cache_key = _satellite_observer_cache_key(
        lat,
        lon,
        altitude_m,
        requested,
        limit,
    )
    cached = _satellite_cached_response(cache_key)
    if cached is not None:
        return cached

    satellites = _satellites.visible(
        lat,
        lon,
        altitude_m,
        requested,
        limit=limit,
    )
    diagnostics = dict(_satellites.last_diagnostics)
    diagnostics["observer_cache"] = "miss"
    diagnostics["observer_cache_age_seconds"] = 0.0
    if not satellites:
        _logger.warning("Satellite request returned no visible objects: %s", diagnostics)

    shared_cache.set_json(
        cache_key,
        {
            "cached_at": unix_time(),
            "satellites": satellites,
            "diagnostics": {
                key: value
                for key, value in diagnostics.items()
                if key not in {"observer_cache", "observer_cache_age_seconds"}
            },
        },
        ttl_seconds=SATELLITE_OBSERVER_CACHE_SECONDS,
    )
    return {
        "satellites": satellites,
        "diagnostics": diagnostics,
    }


@app.get("/api/v1/satellite/info")
def satellite_info(
    norad: int = Query(ge=1, le=999999999),
    name: str = Query(default="", max_length=120),
) -> dict[str, object]:
    info = _satellite_info.lookup(norad, name)
    if info is None:
        return {"satellite": None}

    result = dict(info)
    photo = result.get("photo")
    if isinstance(photo, dict):
        photo_result = dict(photo)
        photo_result["image_path"] = (
            "/api/v1/satellite/photo/image?"
            + urlencode({"norad": norad, "name": name})
        )
        result["photo"] = photo_result
    return {"satellite": result}


@app.get("/api/v1/satellite/photo/image")
def satellite_photo_image(
    norad: int = Query(ge=1, le=999999999),
    name: str = Query(default="", max_length=120),
) -> Response:
    info = _satellite_info.lookup(norad, name)
    if info is None:
        raise HTTPException(status_code=404, detail="Satellite not found")
    photo = info.get("photo")
    if not isinstance(photo, dict):
        raise HTTPException(status_code=404, detail="Satellite photo not found")
    image = _satellite_info.image_bytes(photo)
    if image is None:
        raise HTTPException(status_code=502, detail="Satellite photo source unavailable")
    body, media_type = image
    return Response(
        content=body,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=21600",
            "Content-Encoding": "identity",
        },
    )


@app.get("/api/v1/aircraft")
def nearby_aircraft(
    lat: float = Query(ge=-90.0, le=90.0),
    lon: float = Query(ge=-180.0, le=180.0),
    radius_nm: float = Query(default=43.4488, ge=1.0, le=250.0),
    limit: int = Query(default=450, ge=1, le=500),
) -> dict[str, object]:
    aircraft = _aircraft.nearby(
        lat,
        lon,
        radius_nm=radius_nm,
        limit=limit,
    )
    return {
        "aircraft": aircraft,
        "diagnostics": _aircraft.last_diagnostics,
    }


@app.get("/api/v1/aircraft/photo")
def aircraft_photo(
    registration: str = Query(default="", max_length=32),
    aircraft_type: str = Query(default="", max_length=64),
    icao_hex: str = Query(default="", max_length=12),
) -> dict[str, object]:
    photo = _aircraft_photos.find(registration, aircraft_type, icao_hex)
    if photo is None:
        return {"photo": None}
    image_query = "?" + urlencode(
        {
            "registration": registration,
            "aircraft_type": aircraft_type,
            "icao_hex": icao_hex,
        }
    )
    return {
        "photo": {
            "image_path": "/api/v1/aircraft/photo/image" + image_query,
            "source_url": photo.source_url,
            "title": photo.title,
            "artist": photo.artist,
            "license": photo.license_name,
            "match": photo.match,
            "provider": photo.provider,
            "planespotters_url": photo.planespotters_url,
        }
    }


@app.get("/api/v1/aircraft/photo/image")
def aircraft_photo_image(
    registration: str = Query(default="", max_length=32),
    aircraft_type: str = Query(default="", max_length=64),
    icao_hex: str = Query(default="", max_length=12),
) -> Response:
    photo = _aircraft_photos.find(registration, aircraft_type, icao_hex)
    if photo is None:
        raise HTTPException(status_code=404, detail="Aircraft photo not found")
    image = _aircraft_photos.image_bytes(photo)
    if image is None:
        raise HTTPException(status_code=502, detail="Aircraft photo source unavailable")
    body, media_type = image
    return Response(
        content=body,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=21600", "Content-Encoding": "identity"},
    )


@app.get("/api/v1/aircraft/route")
def aircraft_route(
    callsign: str = Query(default="", max_length=32),
) -> dict[str, object]:
    return {"route": _aircraft_routes.lookup(callsign)}
