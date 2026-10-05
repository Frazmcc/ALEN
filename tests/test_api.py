from fastapi.testclient import TestClient

from alen.api import app


def test_health() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["name"] == "ALEN"
    assert payload["cache"] in {"local", "redis"}


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



def test_aircraft_provider_uses_shared_geographic_snapshot(monkeypatch) -> None:
    from alen.aircraft import AircraftProvider
    from alen.cache import SharedCache

    requested = {"count": 0}

    class Response:
        status_code = 200
        headers = {}

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
            requested["count"] += 1
            requested["url"] = url
            return Response()

    monkeypatch.setattr("alen.aircraft.httpx.Client", Client)
    provider = AircraftProvider(cache=SharedCache(namespace="test-aircraft-shared"))
    provider.nearby(55.77, -4.09, radius_nm=43.4488)
    provider.nearby(55.78, -4.08, radius_nm=43.4488)

    assert requested["count"] == 1
    assert "/lat/55.5000/lon/-4.5000/dist/100" in requested["url"]
    assert provider.last_diagnostics["cache"] == "fresh"

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
        "/api/v1/aircraft/photo?registration=G-TEST&aircraft_type=A320&icao_hex=400001"
    )
    assert response.status_code == 200
    payload = response.json()["photo"]
    assert payload["image_path"].startswith("/api/v1/aircraft/photo/image?")
    assert "registration=G-TEST" in payload["image_path"]
    assert "icao_hex=400001" in payload["image_path"]
    assert payload["artist"] == "Example Photographer"
    assert payload["license"] == "CC BY-SA 4.0"
    assert payload["match"] == "registration"
    assert payload["provider"] == "wikimedia"
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
    monkeypatch.setattr(
        AircraftPhotoProvider,
        "_search_planespotters",
        lambda self, *args, **kwargs: None,
    )
    photo = AircraftPhotoProvider().find("G-TTNY", "A20N")
    assert photo is not None
    assert calls[0]["generator"] == "categorymembers"
    assert calls[0]["gcmtitle"] == "Category:G-TTNY (aircraft)"
    assert photo.match == "registration"
    assert photo.image_url == "https://upload.wikimedia.org/example.jpg"
    assert photo.planespotters_url.endswith("/photos/reg/G-TTNY")


def test_aircraft_photo_prefers_planespotters_exact_hex(monkeypatch) -> None:
    from alen.aircraft_photos import AircraftPhotoProvider

    requested = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "photos": [
                    {
                        "thumbnail": {
                            "src": "https://t.plnspttrs.net/43495/1864265_b4e8176cfe_280.jpg"
                        },
                        "link": "https://www.planespotters.net/photo/1864265",
                        "photographer": "Example Photographer",
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

        def get(self, url: str, params=None):
            requested["url"] = url
            return Response()

    monkeypatch.setattr("alen.aircraft_photos.httpx.Client", Client)
    provider = AircraftPhotoProvider()
    photo = provider.find("EI-IKT", "B38M", "4cae9b")
    assert photo is not None
    assert requested["url"].endswith("/hex/4CAE9B")
    assert photo.provider == "planespotters"
    assert photo.match == "icao"
    assert photo.image_url.startswith("https://t.plnspttrs.net/")
    assert photo.source_url.startswith("https://www.planespotters.net/")


def test_aircraft_photo_proxy_serves_verified_image(monkeypatch) -> None:
    from alen.aircraft_photos import AircraftPhoto

    sample = AircraftPhoto(
        image_url="https://t.plnspttrs.net/example/aircraft.jpg",
        source_url="https://www.planespotters.net/photo/123",
        title="EI-IKT aircraft",
        artist="Example Photographer",
        license_name="Planespotters.net — see source for photo usage terms",
        match="icao",
        planespotters_url="https://www.planespotters.net/photos/reg/EI-IKT",
        provider="planespotters",
    )
    monkeypatch.setattr("alen.api._aircraft_photos.find", lambda *args, **kwargs: sample)
    monkeypatch.setattr(
        "alen.api._aircraft_photos.image_bytes",
        lambda photo: (b"fake-jpeg", "image/jpeg"),
    )
    response = TestClient(app).get(
        "/api/v1/aircraft/photo/image?registration=EI-IKT&aircraft_type=B38M&icao_hex=4cae9b"
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert response.headers["cache-control"] == "public, max-age=21600"
    assert response.content == b"fake-jpeg"


def test_aircraft_photo_provider_does_not_retain_image_bytes() -> None:
    from alen.aircraft_photos import AircraftPhotoProvider

    provider = AircraftPhotoProvider()
    assert not hasattr(provider, "_image_cache")
    assert provider.MAX_METADATA_CACHE_ENTRIES == 512


def test_aircraft_photo_rejects_untrusted_image_host() -> None:
    from alen.aircraft_photos import AircraftPhoto, AircraftPhotoProvider

    photo = AircraftPhoto(
        image_url="https://evil.example/aircraft.jpg",
        source_url="https://www.planespotters.net/photo/123",
        title="Aircraft",
        artist="Photographer",
        license_name="See source",
        match="registration",
        planespotters_url="https://www.planespotters.net/photos",
        provider="planespotters",
    )
    assert AircraftPhotoProvider().image_bytes(photo) is None


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
    from alen.cache import SharedCache

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
    aircraft = AircraftProvider(cache=SharedCache(namespace="test-aircraft-operator")).nearby(55.77, -4.09)
    assert aircraft[0]["flight"] == "SHT16E"
    assert aircraft[0]["operator"] == "British Airways"
    assert aircraft[0]["squawk"] == "0032"
    assert aircraft[0]["db_flags"] == 1


def test_aircraft_route_provider_reuses_shared_cache(monkeypatch) -> None:
    from alen.aircraft_routes import AircraftRouteProvider
    from alen.cache import SharedCache

    calls = {"count": 0}

    class Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "callsign": "SHT16E",
                "airline_code": "BAW",
                "_airports": [
                    {
                        "name": "London Heathrow Airport",
                        "iata": "LHR",
                        "icao": "EGLL",
                        "location": "London",
                        "countryiso2": "GB",
                    },
                    {
                        "name": "Glasgow Airport",
                        "iata": "GLA",
                        "icao": "EGPF",
                        "location": "Glasgow",
                        "countryiso2": "GB",
                    },
                ],
            }

    class Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str):
            calls["count"] += 1
            return Response()

    monkeypatch.setattr("alen.aircraft_routes.httpx.Client", Client)
    provider = AircraftRouteProvider(
        cache=SharedCache(namespace="test-aircraft-route")
    )
    first = provider.lookup("SHT16E")
    second = provider.lookup("SHT16E")

    assert calls["count"] == 1
    assert first == second
    assert first is not None
    assert first["departure"]["iata"] == "LHR"
    assert first["arrival"]["iata"] == "GLA"


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
    from alen.cache import SharedCache
    from alen.satellite_info import SatelliteInfoProvider

    provider = SatelliteInfoProvider(
        cache=SharedCache(namespace="test-satellite-info")
    )
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
