"""Guard all-satellite coverage against silent filtering and group outages."""
from pathlib import Path

from fastapi.testclient import TestClient

from alen.api import app

APP = Path("web/app.js").read_text(encoding="utf-8")
API = Path("src/alen/api.py").read_text(encoding="utf-8")
BACKEND = Path("src/alen/satellites.py").read_text(encoding="utf-8")


def test_browser_loads_far_more_than_500_satellites():
    assert "const SATELLITE_REQUEST_LIMIT=2000;" in APP
    assert 'groups:sources.join(","),limit:String(SATELLITE_REQUEST_LIMIT)' in APP
    assert 'limit:"500"' not in APP
    assert "const maxRange=isStarlink?10000:2000000;" in APP


def test_api_allows_a_bounded_2500_satellite_response():
    assert "limit: int = Query(default=260, ge=1, le=2500)" in API
    assert "cap = max(1, min(int(limit), 2500))" in BACKEND
    invalid=TestClient(app).get(
        "/api/v1/satellites",
        params={"lat":55.77,"lon":-4.09,"limit":2501},
    )
    assert invalid.status_code == 422


def test_partial_upstream_group_failure_does_not_discard_other_satellites():
    assert 'const partialCatalogue=satelliteDiagnostics?.complete===false;' in APP
    assert 'satelliteRequestState=partialCatalogue||earthSourceUnavailable()?"partial":"ok";' in APP
    assert 'if(partialCatalogue&&!(Array.isArray(data.satellites)&&data.satellites.length))' in APP
    assert 'else if(satelliteRequestState==="partial")' in APP
    assert 'feedStatus.textContent+=" · partial catalogue"' in APP
    assert "throw new Error(\"satellite catalogue incomplete\"+(missing.length" not in APP


def test_sampling_preserves_all_group_memberships_without_duplicate_norads():
    assert "group_items.setdefault(str(group), []).append(item)" in BACKEND
    assert "per_group_min =" in BACKEND
    assert "if identifier not in identities" in BACKEND
