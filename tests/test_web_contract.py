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
    assert 'href="/favicon.png?v=4"' in HTML
    assert '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=4">' in HTML
    assert '<link rel="shortcut icon" type="image/png" href="/favicon.png?v=4">' in HTML
    logo_path = Path("web/assets/alen-logo.png")
    assert logo_path.is_file()
    logo = logo_path.read_bytes()
    assert logo.startswith(b"\x89PNG\r\n\x1a\n")
    offset = 8
    chunk_types = []
    while offset + 12 <= len(logo):
        length = int.from_bytes(logo[offset:offset + 4], "big")
        end = offset + 12 + length
        assert end <= len(logo), "ALEN logo PNG is truncated"
        chunk_type = logo[offset + 4:offset + 8]
        chunk_types.append(chunk_type)
        offset = end
        if chunk_type == b"IEND":
            break
    assert chunk_types[0] == b"IHDR"
    assert b"IDAT" in chunk_types
    assert chunk_types[-1] == b"IEND"
    assert offset == len(logo)
    assert "data:image/png;base64," not in HTML
    assert './app.js?v=0.9.0' in HTML


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
    assert "API_BASE+\"/api/v1/satellites?\"" in APP
    assert "SGP4 · CelesTrak orbital elements" in APP
    assert 'data-layer="aircraft" aria-pressed="true"' in HTML
    assert 'data-layer="satellites" aria-pressed="true"' in HTML


def test_airports_are_clickable_selectable_objects_with_media() -> None:
    assert 'data-layer="airports"' not in HTML
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


def test_satellite_group_controls_and_visual_categories() -> None:
    assert 'id="satellite-groups-button"' in HTML
    assert 'id="satellite-groups"' in HTML
    for key in (
        "new", "stations", "bright", "starlink", "oneweb", "kuiper",
        "navigation", "weather", "earth", "science", "amateur", "geo",
        "military", "cubesat", "debris",
    ):
        assert f'data-satellite-group="{key}"' in HTML
        assert f"{key}:{{label:" in APP
    assert 'sources:["last-30-days"]' in APP
    assert 'sources:["fengyun-1c-debris","iridium-33-debris","cosmos-2251-debris","cosmos-1408-debris"]' in APP
    assert 'isNew:memberships.includes("new")' in APP
    assert 'isDebris:memberships.includes("debris")' in APP
    assert 'satellitePrimaryGroup' in APP
    assert 'group.enabled=input.checked' in APP
    assert 'ctx.fillStyle=s.color' in APP
    assert 'ctx.fillText(s.glyph||"◇"' in APP
    assert '["Category",o.groupLabel||"Satellite"]' in APP
    assert '["New launch",o.isNew?"Yes · ≤30 days":"No"]' in APP
    assert '["Debris",o.isDebris?"Yes":"No"]' in APP


def test_dense_stars_and_real_planets_are_present() -> None:
    star_path = Path("web/data/bright-stars.json")
    assert star_path.is_file()
    import json
    payload = json.loads(star_path.read_text(encoding="utf-8"))
    assert payload["count"] >= 2500
    assert payload["magnitude_limit"] <= 5.5
    assert "function loadBrightStars()" in APP
    assert "function solarSystemRaDec(ms)" in APP
    assert "function currentPlanetObjects(ms)" in APP
    for body in ("sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"):
        assert f'{body}:{{name:' in APP


def test_satellites_use_backend_sgp4_live_positions() -> None:
    assert 'API_BASE+"/api/v1/satellites?"+qs' in APP
    assert 'satelliteTimer=setInterval(()=>refreshSatellites(false),10000)' in APP
    assert 'function stepSatellites(_ms){}' in APP


def test_landscape_is_foreground_occlusion_layer() -> None:
    assert "function drawLandscapeForeground()" in APP
    assert "function isAboveLandscape(az,el)" in APP
    assert "drawLandscapeForeground();" in APP
    assert "isAboveLandscape(o.az,o.el)" in APP
    assert "isAboveLandscape(q.az,q.el)" in APP
    assert "isAboveLandscape(s.az,s.el)" in APP
    draw_start = APP.index("function draw(){")
    draw_end = APP.index("function allSelectableObjects()", draw_start)
    draw = APP[draw_start:draw_end]
    assert draw.index("if(layers.stars)") < draw.index("drawLandscapeForeground();")
    assert draw.index("if(layers.planets)") < draw.index("drawLandscapeForeground();")
    assert draw.index("if(layers.aircraft)") < draw.index("drawLandscapeForeground();")
    assert draw.index("if(layers.satellites)") < draw.index("drawLandscapeForeground();")
    assert draw.index("drawLandscapeForeground();") < draw.index("if(layers.airports)")


def test_astronomy_controls_are_grouped() -> None:
    assert 'class="layer-group" aria-label="Astronomy layers"' in HTML
    assert '<span class="layer-group-title">Astronomy</span>' in HTML
    astronomy_start = HTML.index('class="layer-group" aria-label="Astronomy layers"')
    astronomy_end = HTML.index('</section>', astronomy_start)
    astronomy = HTML[astronomy_start:astronomy_end]
    assert 'data-layer="stars"' in astronomy
    assert 'data-layer="atmosphere"' in astronomy
    assert 'data-layer="constellations"' in astronomy
    assert 'data-layer="planets"' not in astronomy


def test_true_observer_projection_and_aircraft_geometry() -> None:
    assert "function verticalFovRad()" in APP
    assert "function geodeticToEcef(latDeg,lonDeg,altM)" in APP
    assert "const east=-Math.sin(lonr)*dx+Math.cos(lonr)*dy" in APP
    assert "const north=-Math.sin(latr)*Math.cos(lonr)*dx" in APP
    assert "const up=Math.cos(latr)*Math.cos(lonr)*dx" in APP
    assert "el:Math.atan2(up,horizontalM)*RAD" in APP
    assert "slantRangeKm:slantRangeM/1000" in APP
    assert "const target=[Math.cos(elr)*Math.sin(azr),Math.cos(elr)*Math.cos(azr),Math.sin(elr)]" in APP
    assert "const forward=[Math.cos(pitchr)*Math.sin(yawr),Math.cos(pitchr)*Math.cos(yawr),Math.sin(pitchr)]" in APP
    assert "const z=target[0]*forward[0]+target[1]*forward[1]+target[2]*forward[2]" in APP
    assert '["Slant range",o.slantRangeKm.toFixed(1)+" km"]' in APP


def test_satellite_backend_uses_omm_json() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "from sgp4 import omm" in source
    assert 'params={"GROUP": group.upper(), "FORMAT": "JSON"}' in source
    assert "omm.initialize(satellite, fields)" in source
    assert "Satrec.twoline2rv" not in source


def test_docs_do_not_reference_external_comparison_project() -> None:
    forbidden = "stel" + "larium"
    for path in Path(".").rglob("*.md"):
        assert forbidden not in path.read_text(encoding="utf-8").lower()
