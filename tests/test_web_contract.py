from pathlib import Path

HTML = Path("web/index.html").read_text(encoding="utf-8")
APP = Path("web/app.js").read_text(encoding="utf-8")


def test_web_identity_and_security_contract() -> None:
    assert "ALEN" in HTML
    assert "Astronomical Live Environment &amp; Navigation" in HTML
    assert 'http-equiv="Content-Security-Policy"' in HTML
    for directive in (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "connect-src 'self'",
        "https://api.adsb.lol",
        "https://celestrak.org",
        "https://s3.amazonaws.com",
        "https://alen-api-lquw.onrender.com",
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ):
        assert directive in HTML


def test_selection_is_explicitly_toggleable() -> None:
    assert "if(selected?.id===o.id)clearSelection();else showObject(o)" in APP
    assert "function clearSelection()" in APP


def test_no_inline_remote_dependencies() -> None:
    assert "<script src=" in HTML
    assert "<script>" not in HTML


def test_alen_brand_logo_and_favicon_are_present() -> None:
    assert 'class="brand-mark"' in HTML
    assert 'rel="icon"' in HTML
    assert 'rel="apple-touch-icon"' in HTML
    assert "./assets/alen-logo.png?v=2" in HTML
    assert Path("web/assets/alen-logo.png").is_file()
    assert "data:image/png;base64," not in HTML


def test_live_location_and_horizon_contract() -> None:
    assert "navigator.geolocation.getCurrentPosition" in APP
    assert "navigator.geolocation.watchPosition" in APP
    assert 'id="location-status"' in HTML
    assert "function horizonBottomGap()" in APP
    assert "return width<=900?70:72" in APP
    assert "function updateMinPitch()" in APP
    assert "pitch=minPitch" in APP
    assert "pitch=clamp(drag.pitch+dy/height*fov*.62,minPitch,89)" in APP
    assert "function drawLandscapeLayer" in APP
    assert "function terrainElevationAt" in APP
    assert "function refreshTerrainProfile" in APP
    assert "function terrainHorizonElevation" in APP
    assert "elevation-tiles-prod/terrarium" in APP
    assert 'data-layer="landscape" aria-pressed="true"' in HTML
    assert 'tabindex="0"' in HTML
    assert 'canvas.addEventListener("keydown"' in APP


def test_live_view_has_no_time_transport_controls() -> None:
    for control_id in ("time-back", "time-play", "time-forward", "time-rate", "time-now"):
        assert f'id="{control_id}"' not in HTML
    assert "simTime=Date.now()" in APP
    assert "timeRate" not in APP
    assert "running" not in APP


def test_live_aircraft_and_satellite_contract() -> None:
    assert "https://api.adsb.lol/v2/lat/" in APP
    assert "AIRCRAFT_RADIUS_MILES=50" in APP
    assert "AIRCRAFT_RADIUS_KM=80.4672" in APP
    assert "AIRCRAFT_RADIUS_NM=43.4488" in APP
    assert "AIRPORT_RADIUS_MILES=50" in APP
    assert "AIRPORT_RADIUS_KM=80.4672" in APP
    assert "dist/${AIRCRAFT_RADIUS_NM}" in APP
    assert "distanceKm<=AIRCRAFT_RADIUS_KM" in APP
    assert "requestAnimationFrame(tick)" in APP
    assert "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json" in APP
    assert "satelliteAltAz" in APP
    assert 'data-layer="aircraft" aria-pressed="true"' in HTML
    assert 'data-layer="satellites" aria-pressed="true"' in HTML


def test_airports_are_clickable_selectable_objects_with_media() -> None:
    assert 'data-layer="airports" aria-pressed="true"' in HTML
    assert 'id="inspector-media"' in HTML
    assert 'id="inspector-image"' in HTML
    assert 'id="inspector-image-credit"' in HTML
    assert 'const API_BASE="https://alen-api-lquw.onrender.com"' in APP
    assert 'kind:"AIRPORT"' in APP
    assert "function refreshAirports()" in APP
    assert "radius_km:String(AIRPORT_RADIUS_KM)" in APP
    assert "Number(a.distance_km)<=AIRPORT_RADIUS_KM" in APP
    assert "function airportDisplayObject" in APP
    assert "airports.map(airportDisplayObject)" in APP
    assert 'o.kind==="AIRPORT"' in APP
    assert "function updateInspectorMedia(o)" in APP
    assert "function objectVisualSvg(o)" in APP


def test_docs_do_not_reference_external_comparison_project() -> None:
    forbidden = "stel" + "larium"
    for path in Path(".").rglob("*.md"):
        assert forbidden not in path.read_text(encoding="utf-8").lower()
