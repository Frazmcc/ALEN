from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__

app = FastAPI(
    title="ALEN API",
    version=__version__,
    description="Backend services for Astronomical Live Environment & Navigation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "name": "ALEN",
        "version": __version__,
        "timestamp": datetime.now(UTC).isoformat(),
    }
