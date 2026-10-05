from __future__ import annotations

from datetime import UTC, datetime
import logging
from urllib.parse import urlencode

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .aircraft import AircraftProvider
from .aircraft_photos import AircraftPhotoProvider
from .aircraft_routes import AircraftRouteProvider
from .airports import AirportProvider
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

_aircraft = AircraftProvider()
_aircraft_photos = AircraftPhotoProvider()
_aircraft_routes = AircraftRouteProvider()
_airports = AirportProvider()
_satellites = SatelliteProvider()
_satellite_info = SatelliteInfoProvider()
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


@app.get("/api/v1/satellite/info")
def satellite_info(
    norad: int = Query(ge=1, le=999999999),
    name: str = Query(default="", max_length=120),
) -> dict[str, object]:
    return {"satellite": _satellite_info.lookup(norad, name)}


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
        headers={"Cache-Control": "public, max-age=21600"},
    )


@app.get("/api/v1/aircraft/route")
def aircraft_route(
    callsign: str = Query(default="", max_length=32),
) -> dict[str, object]:
    return {"route": _aircraft_routes.lookup(callsign)}
