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
    monkeypatch.setattr("alen.api._satellites.last_diagnostics", {"unique_orbits": 1, "visible": 1})
    response = TestClient(app).get(
        "/api/v1/satellites?lat=55.86&lon=-4.25&altitude_m=50&groups=stations&limit=10"
    )
    assert response.status_code == 200
    assert response.json()["satellites"] == sample
    assert response.json()["diagnostics"]["visible"] == 1


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


def test_nearby_aircraft_endpoint(monkeypatch) -> None:
    sample = [
        {
            "hex": "406abc",
            "flight": "BAW123",
            "registration": "G-TEST",
            "type": "A320",
            "lat": 55.90,
            "lon": -4.20,
            "alt_baro": 14000,
            "alt_geom": 14200,
            "gs": 310,
            "track": 95,
            "seen": 0.4,
            "distance_km": 8.2,
        }
    ]
    monkeypatch.setattr("alen.api._aircraft.nearby", lambda *args, **kwargs: sample)
    response = TestClient(app).get(
        "/api/v1/aircraft?lat=55.86&lon=-4.25&radius_nm=43.4488&limit=450"
    )
    assert response.status_code == 200
    assert response.json()["aircraft"] == sample


def test_aircraft_provider_rounds_radius_for_adsb_api(monkeypatch) -> None:
    from alen.aircraft import AircraftProvider

    requested = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"ac": []}

    class Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str):
            requested["url"] = url
            return Response()

    monkeypatch.setattr("alen.aircraft.httpx.Client", Client)
    AircraftProvider().nearby(55.77, -4.09, radius_nm=43.4488)
    assert requested["url"].endswith("/dist/44")


def test_aircraft_photo_endpoint(monkeypatch) -> None:
    from alen.aircraft_photos import AircraftPhoto

    sample = AircraftPhoto(
        image_url="https://upload.wikimedia.org/example.jpg",
        source_url="https://commons.wikimedia.org/wiki/File:Example.jpg",
        title="G-TEST aircraft",
        artist="Example Photographer",
        license_name="CC BY-SA 4.0",
        match="registration",
        planespotters_url="https://www.planespotters.net/photos/reg/G-TEST",
    )
    monkeypatch.setattr("alen.api._aircraft_photos.find", lambda *args, **kwargs: sample)
    response = TestClient(app).get(
        "/api/v1/aircraft/photo?registration=G-TEST&aircraft_type=A320"
    )
    assert response.status_code == 200
    payload = response.json()["photo"]
    assert payload["image_url"] == sample.image_url
    assert payload["artist"] == "Example Photographer"
    assert payload["license"] == "CC BY-SA 4.0"
    assert payload["match"] == "registration"
    assert payload["planespotters_url"].endswith("/photos/reg/G-TEST")


def test_aircraft_photo_prefers_commons_registration_category(monkeypatch) -> None:
    from alen.aircraft_photos import AircraftPhotoProvider

    calls = []

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "query": {
                    "pages": [
                        {
                            "title": "File:British Airways A320neo at Heathrow.jpg",
                            "imageinfo": [
                                {
                                    "mime": "image/jpeg",
                                    "thumburl": "https://upload.wikimedia.org/example.jpg",
                                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
                                    "extmetadata": {
                                        "Artist": {"value": "Example Photographer"},
                                        "LicenseShortName": {"value": "CC BY-SA 4.0"},
                                    },
                                }
                            ],
                        }
                    ]
                }
            }

    class Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str, params=None):
            calls.append(dict(params or {}))
            return Response()

    monkeypatch.setattr("alen.aircraft_photos.httpx.Client", Client)
    photo = AircraftPhotoProvider().find("G-TTNY", "A20N")
    assert photo is not None
    assert calls[0]["generator"] == "categorymembers"
    assert calls[0]["gcmtitle"] == "Category:G-TTNY (aircraft)"
    assert photo.match == "registration"
    assert photo.image_url == "https://upload.wikimedia.org/example.jpg"
    assert photo.planespotters_url.endswith("/photos/reg/G-TTNY")


def test_orbitalwiki_elements_fallback(monkeypatch) -> None:
    from alen.satellites import SatelliteProvider

    payload = {
        "norad_cat_id": [25544],
        "name": ["ISS (ZARYA)"],
        "object_id": ["1998-067A"],
        "epoch": ["2026-10-04T12:00:00.000000Z"],
        "mean_motion": [15.49],
        "eccentricity": [0.0007],
        "inclination": [51.64],
        "raan": [100.0],
        "arg_perigee": [20.0],
        "mean_anomaly": [340.0],
        "bstar": [0.0001],
        "mean_motion_dot": [0.00001],
        "mean_motion_ddot": [0.0],
        "rev_at_epoch": [12345],
    }

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return payload

    class Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str, params=None):
            assert url == "https://www.orbitalwiki.com/api/v1/elements"
            return Response()

    monkeypatch.setattr("alen.satellites.httpx.Client", Client)
    records = SatelliteProvider()._fetch_orbitalwiki_catalog()
    assert len(records) == 1
    assert records[0].norad == 25544
    assert records[0].name == "ISS (ZARYA)"


def test_aircraft_provider_exposes_operator(monkeypatch) -> None:
    from alen.aircraft import AircraftProvider

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "ac": [
                    {
                        "hex": "407abc",
                        "flight": "SHT16E",
                        "r": "G-TTNY",
                        "t": "A20N",
                        "ownOp": "British Airways",
                        "squawk": "0032",
                        "dbFlags": 1,
                        "lat": 55.77,
                        "lon": -4.09,
                        "alt_baro": 30000,
                        "gs": 420,
                        "track": 329,
                    }
                ]
            }

    class Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str):
            return Response()

    monkeypatch.setattr("alen.aircraft.httpx.Client", Client)
    aircraft = AircraftProvider().nearby(55.77, -4.09)
    assert aircraft[0]["flight"] == "SHT16E"
    assert aircraft[0]["operator"] == "British Airways"
    assert aircraft[0]["squawk"] == "0032"
    assert aircraft[0]["db_flags"] == 1


def test_aircraft_route_endpoint(monkeypatch) -> None:
    sample = {
        "callsign": "SHT16E",
        "airline_code": "BAW",
        "departure": {"name": "London Heathrow Airport", "iata": "LHR", "icao": "EGLL", "location": "London", "country": "GB"},
        "arrival": {"name": "Glasgow Airport", "iata": "GLA", "icao": "EGPF", "location": "Glasgow", "country": "GB"},
        "via": [],
        "source": "ADSB.lol VRS standing data",
    }
    monkeypatch.setattr("alen.api._aircraft_routes.lookup", lambda callsign: sample)
    response = TestClient(app).get("/api/v1/aircraft/route?callsign=SHT16E")
    assert response.status_code == 200
    route = response.json()["route"]
    assert route["departure"]["iata"] == "LHR"
    assert route["arrival"]["iata"] == "GLA"


def test_satellite_info_endpoint(monkeypatch) -> None:
    sample = {
        "name": "CZ-2C R/B",
        "norad": 54039,
        "object_type": "Rocket body",
        "owner": "People's Republic of China",
        "launch_date": "2022-10-12",
        "purpose": "Spent launch-vehicle stage.",
        "cost": "Not separately published",
        "life_expectancy": "Not applicable",
    }
    monkeypatch.setattr("alen.api._satellite_info.lookup", lambda *args, **kwargs: sample)
    response = TestClient(app).get("/api/v1/satellite/info?norad=54039&name=CZ-2C%20R%2FB")
    assert response.status_code == 200
    assert response.json()["satellite"] == sample


def test_satellite_info_provider_combines_catalog_and_mission_data(monkeypatch) -> None:
    from alen.satellite_info import SatelliteInfoProvider

    provider = SatelliteInfoProvider()
    monkeypatch.setattr(
        provider,
        "_satcat",
        lambda norad: {
            "OBJECT_NAME": "CZ-2C R/B",
            "OBJECT_ID": "2022-132E",
            "NORAD_CAT_ID": 54039,
            "OBJECT_TYPE": "R/B",
            "OWNER": "PRC",
            "LAUNCH_DATE": "2022-10-12",
            "LAUNCH_SITE": "TSC",
            "PERIOD": 90.93,
            "INCLINATION": 97.29,
            "APOGEE": 329,
            "PERIGEE": 311,
            "RCS": 23.715,
        },
    )
    monkeypatch.setattr(provider, "_satnogs", lambda norad: None)
    monkeypatch.setattr(provider, "_commons_photo", lambda *args, **kwargs: None)

    info = provider.lookup(54039, "CZ-2C R/B")
    assert info is not None
    assert info["object_type"] == "Rocket body"
    assert info["owner"] == "People's Republic of China"
    assert info["launch_site"] == "Taiyuan Satellite Launch Center, China"
    assert "Spent launch-vehicle stage" in str(info["purpose"])
    assert "Not applicable" in str(info["life_expectancy"])
    assert "spent stage" in str(info["cost"])
    assert info["period_minutes"] == 90.93
    assert info["apogee_km"] == 329.0
