from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .airports import AirportProvider
from .satellites import SatelliteProvider

app = FastAPI(
    title="ALEN API",
    version=__version__,
    description="Backend services for Astronomical Live Environment & Navigation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://frazmcc.github.io"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)

_airports = AirportProvider()
_satellites = SatelliteProvider()


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
    return {
        "satellites": _satellites.visible(
            lat,
            lon,
            altitude_m,
            requested,
            limit=limit,
        )
    }
