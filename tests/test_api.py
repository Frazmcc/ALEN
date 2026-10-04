from fastapi.testclient import TestClient

from alen.api import app


def test_health() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["name"] == "ALEN"


def test_nearby_airports_endpoint(monkeypatch) -> None:
    sample = [
        {
            "iata": "GLA",
            "icao": "EGPF",
            "name": "Glasgow Airport",
            "latitude": 55.8719,
            "longitude": -4.4331,
            "distance_km": 12.3,
            "bearing_deg": 275.0,
            "type": "large_airport",
        }
    ]
    monkeypatch.setattr("alen.api._airports.nearby", lambda *args, **kwargs: sample)
    response = TestClient(app).get("/api/v1/airports?lat=55.86&lon=-4.25&radius_km=180&limit=14")
    assert response.status_code == 200
    assert response.json()["airports"] == sample


def test_visible_satellites_endpoint(monkeypatch) -> None:
    sample = [
        {
            "norad": 25544,
            "name": "ISS (ZARYA)",
            "international_id": "1998-067A",
            "azimuth_deg": 180.0,
            "elevation_deg": 42.0,
            "range_km": 820.0,
            "groups": ["stations"],
        }
    ]
    monkeypatch.setattr("alen.api._satellites.visible", lambda *args, **kwargs: sample)
    response = TestClient(app).get(
        "/api/v1/satellites?lat=55.86&lon=-4.25&altitude_m=50&groups=stations&limit=10"
    )
    assert response.status_code == 200
    assert response.json()["satellites"] == sample


def test_custom_domain_cors_is_allowed() -> None:
    response = TestClient(app).options(
        "/api/v1/health",
        headers={
            "Origin": "https://alen.observer",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://alen.observer"
