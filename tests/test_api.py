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
