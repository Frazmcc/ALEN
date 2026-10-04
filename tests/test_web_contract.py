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
    assert 'href="/favicon.ico?v=6"' in HTML
    assert '<link rel="icon" href="/favicon.ico?v=6" sizes="any">' in HTML
    assert '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=6">' in HTML
    assert '<link rel="shortcut icon" href="/favicon.ico?v=6">' in HTML
    favicon_ico = Path("web/favicon.ico")
    assert favicon_ico.is_file()
    assert favicon_ico.read_bytes().startswith(b"\x00\x00\x01\x00")
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
    assert './app.js?v=1.4.2' in HTML


def test_live_location_and_horizon_contract() -> None:
    assert "navigator.geolocation.getCurrentPosition" in APP
    assert "navigator.geolocation.watchPosition" in APP
    assert 'id="location-status"' in HTML
    assert "function horizonBottomGap()" in APP
    assert 'document.querySelector(".layerbar")' in APP
    assert "footerHeight+10" in APP
    assert "function updateMinPitch()" in APP
    assert "pitch=minPitch" in APP
    assert "pitch=clamp(drag.pitch+dy/height*fov*.62,minPitch,89)" in APP
    assert "function drawLandscapeLayer" in APP
    assert "function screenYForElevation(el,az=yaw)" in APP
    assert "const p=project(az,el)" in APP
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
    assert 'API_BASE+"/api/v1/aircraft?"+qs' in APP
    assert "AIRCRAFT_RADIUS_MILES=50" in APP
    assert "AIRCRAFT_RADIUS_KM=80.4672" in APP
    assert "AIRCRAFT_RADIUS_NM=43.4488" in APP
    assert "AIRPORT_RADIUS_MILES=50" in APP
    assert "AIRPORT_RADIUS_KM=80.4672" in APP
    assert 'radius_nm:String(AIRCRAFT_RADIUS_NM)' in APP
    assert "requestAnimationFrame(tick)" in APP
    assert "API_BASE+\"/api/v1/satellites?\"" in APP
    assert "SGP4 · CelesTrak orbital elements" in APP
    assert 'data-layer="aircraft" aria-pressed="true"' in HTML
    assert 'data-layer="satellites" aria-pressed="true"' in HTML
    assert 'data-satellite-group="starlink" checked' in HTML
    assert "fov=130" in APP


def test_airports_are_clickable_selectable_objects_with_media() -> None:
    assert 'data-layer="airports"' not in HTML
    assert 'id="inspector-media"' in HTML
    assert 'id="inspector-image"' in HTML
    assert 'id="inspector-image-credit"' in HTML
    assert 'const API_BASE="https://alen-api-lquw.onrender.com"' in APP
    assert 'kind:"AIRPORT"' in APP
    assert "function refreshAirports()" in APP
    assert "radius_km:String(AIRPORT_RADIUS_KM)" in APP
    assert 'limit:"30"' in APP
    assert "Number(a.distance_km)<=AIRPORT_RADIUS_KM" in APP
    assert "setTimeout(()=>refreshAirports(),5000)" in APP
    assert "horizonEl+1.6" in APP
    assert "function airportDisplayObject" in APP
    assert "airports.map(airportDisplayObject)" in APP
    assert 'o.kind==="AIRPORT"' in APP
    assert "function updateInspectorMedia(o)" in APP
    assert "function objectVisualSvg(o)" in APP
    assert 'o.kind==="PLANET"' in APP
    assert 'o.kind==="STAR"' in APP
    assert "Apparent magnitude" in APP
    assert "Temperature" in APP


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
    assert "satelliteDiagnostics=data.diagnostics||null" in APP
    assert "satellite feed unavailable" in APP


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
    assert "omm.initialize(satellite, fields)" in source
    assert "Satrec.twoline2rv" in source
    assert '"FORMAT": "TLE"' in source


def test_docs_do_not_reference_external_comparison_project() -> None:
    forbidden = "stel" + "larium"
    for path in Path(".").rglob("*.md"):
        assert forbidden not in path.read_text(encoding="utf-8").lower()


def test_unified_sky_object_foundation() -> None:
    assert "function makeSkyObject(raw)" in APP
    assert "function skyObjectScreen(o)" in APP
    assert "function skyObjectVisible(o" in APP
    assert "aboveGeometricHorizon" in APP
    assert "aboveTerrainHorizon" in APP
    assert 'return makeAstronomySkyObject({id:"planet:"+id' in APP
    assert 'return makeSkyObject({id:"sat:"+s.norad' in APP
    assert 'return p?makeAstronomySkyObject({...o,az:p.az,el:p.el}):null' in APP
    assert "airports.map(airportDisplayObject).filter(o=>skyObjectVisible" in APP
    assert "skyObjectScreen(o)" in APP


def test_astronomical_refraction_and_apparent_elevation() -> None:
    assert "function atmosphericRefractionDeg(geometricEl)" in APP
    assert "function makeAstronomySkyObject(raw)" in APP
    assert "geometricEl" in APP
    assert "refractionDeg" in APP
    assert 'return makeAstronomySkyObject({id:"planet:"+id' in APP
    assert 'return p?makeAstronomySkyObject({...o,az:p.az,el:p.el}):null' in APP
    assert '"Apparent elevation"' in APP
    assert '"Geometric elevation"' in APP
    assert '"Refraction"' in APP


def test_star_atmospheric_extinction() -> None:
    assert "function atmosphericExtinctionMagnitude(geometricEl)" in APP
    assert "apparentMag" in APP
    assert "extinctionMag" in APP
    assert "visualMag=Number.isFinite(o.apparentMag)?o.apparentMag:o.mag" in APP
    assert '"Catalogue magnitude"' in APP
    assert '"Atmospheric extinction"' in APP


def test_aircraft_persistence_across_transient_feed_gaps() -> None:
    assert "const AIRCRAFT_GRACE_MS=20000" in APP
    assert "lastSeenAt:wallNow" in APP
    assert "if(wallNow-lastSeenAt<=AIRCRAFT_GRACE_MS)next.set(id,prior)" in APP
    assert "retaining recent aircraft" in APP
    assert "aircraft=aircraft.filter" in APP


def test_satellite_refresh_runs_independently_of_display_toggle() -> None:
    assert 'satelliteRequestState="idle",satelliteRequestInFlight=false' in APP
    assert "if(!observer)return;" in APP
    assert 'satelliteRequestState="requesting"' in APP
    assert 'satelliteRequestState="ok"' in APP
    assert 'satelliteRequestState="error"' in APP
    assert "setTimeout(()=>refreshSatellites(true),1500)" in APP
    assert 'if(key==="satellites")refreshSatellites(true);' in APP
    assert "await refreshSatellites(true);" in APP


def test_aircraft_photo_inspector_contract() -> None:
    assert 'API_BASE+"/api/v1/aircraft/photo?"+qs' in APP
    assert 'photo.match==="registration"?"exact registration":"aircraft type"' in APP
    assert 'function trustedExternalUrl(value,allowedHost)' in APP
    assert 'url.protocol!=="https:"||url.hostname!==allowedHost' in APP
    assert 'trustedExternalUrl(photo?.image_url,"upload.wikimedia.org")' in APP
    assert 'appendInspectorLink(credit,"Source",photo.source_url,"commons.wikimedia.org")' in APP
    assert 'appendInspectorLink(credit,"More photos",photo.planespotters_url,"www.planespotters.net")' in APP
    assert "https://upload.wikimedia.org" in HTML


def test_sky_colour_tracks_local_solar_elevation() -> None:
    assert "function currentSunAltAz(ms)" in APP
    assert "function timeOfDaySky(sunEl)" in APP
    assert "{el:-18" in APP
    assert "{el:-12" in APP
    assert "{el:-6" in APP
    assert "{el:-1" in APP
    assert "{el:6" in APP
    assert "{el:25" in APP
    assert "const sun=currentSunAltAz(simTime),sky=timeOfDaySky(sun?.el)" in APP
    assert "g.addColorStop(0,sky.top)" in APP
    assert "sky.starVisibility" in APP


def test_satellite_requests_are_bounded_and_non_overlapping() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "ThreadPoolExecutor" in source
    assert "as_completed" in source
    assert "max_workers=min(6, len(requested_groups))" in source
    assert "timeout=8.0" in source
    assert "if(!observer||satelliteRequestInFlight)return;" in APP
    assert "const controller=new AbortController()" in APP
    assert "setTimeout(()=>controller.abort(),20000)" in APP
    assert "satelliteRequestInFlight=false" in APP


def test_daylight_contrast_palette() -> None:
    css = Path("web/styles.css").read_text(encoding="utf-8")
    assert 'root.dataset.skyMode=dayMode?"day":"night"' in APP
    assert 'const objectText=dayMode?"#08283f":"#eef8ff"' in APP
    assert 'const aircraftInk=dayMode?"#083a59":"#9fd9ff"' in APP
    assert 'ctx.strokeText("✈",0,0)' in APP
    assert 'data-sky-mode="day"' in css


def test_landscape_extends_beyond_viewport_edges() -> None:
    assert "const step=5,margin=Math.max(80,width*.08)" in APP
    assert "for(let x=-margin;x<=width+margin;x+=step)" in APP
    assert "ctx.lineTo(width+margin,height+2)" in APP
    assert "ctx.lineTo(-margin,height+2)" in APP


def test_satellite_public_tle_fallback() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert 'FALLBACK_URL = "https://tle.ivanstanojevic.me/api/tle"' in source
    assert "def _load_fallback_catalog" in source
    assert "def _fetch_fallback_catalog" in source
    assert '"page-size": "100"' in source
    assert '"sort": "popularity"' in source
    assert 'payload.get("member")' in source
    assert 'merged[record.norad] = (record, {"visual"})' in source
    assert '"fallback_used": fallback_used' in source
