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
    assert './app.js?v=1.6.6' in HTML


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
    assert "function traceTerrainSkyline()" in APP
    assert "function drawDistantTerrain(dayMode)" in APP
    assert "function drawLandscapeForeground()" in APP
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
    assert 'id="aircraft-groups-button"' in HTML
    assert 'id="satellite-groups-button"' in HTML
    assert 'data-satellite-group="starlink" aria-pressed="true"' in HTML
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
    assert 'group.enabled=phaseEnabled(group.phase)' in APP
    assert "drawSatelliteIcon(visualType,satSize,s.color" in APP
    assert "drawSatelliteIcon(visualType,satSize,s.color" in APP
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
    assert 'function stepSatellites(now)' in APP
    assert "satelliteDiagnostics=data.diagnostics||null" in APP
    assert "satellite feed unavailable" in APP


def test_landscape_is_split_into_distant_terrain_and_flat_foreground() -> None:
    assert "function drawDistantTerrain(dayMode)" in APP
    assert "function drawLandscapeForeground()" in APP
    assert "function isAboveLandscape(az,el)" in APP
    assert "drawDistantTerrain(dayMode);" in APP
    assert "drawLandscapeForeground();" in APP
    assert "isAboveLandscape(o.az,o.el)" in APP
    assert "isAboveLandscape(q.az,q.el)" in APP
    assert "isAboveLandscape(s.az,s.el)" in APP
    assert 'ctx.fillStyle="rgba(2,5,7,.985)"' in APP
    assert "ctx.fillRect(0,y,width,height-y+2)" in APP
    draw_start = APP.index("function draw(){")
    draw_end = APP.index("function allSelectableObjects()", draw_start)
    draw = APP[draw_start:draw_end]
    assert draw.index("if(layers.stars)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.planets)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.aircraft)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.satellites)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("drawDistantTerrain(dayMode);") < draw.index("drawLandscapeForeground();")
    assert draw.index("drawLandscapeForeground();") < draw.index("if(layers.airports)")


def test_footer_controls_are_grouped_into_four_tabs() -> None:
    for control_id in (
        "astronomy-groups-button",
        "aircraft-groups-button",
        "satellite-groups-button",
        "display-groups-button",
    ):
        assert f'id="{control_id}"' in HTML

    astronomy_start = HTML.index('id="astronomy-groups"')
    astronomy_end = HTML.index('</aside>', astronomy_start)
    astronomy = HTML[astronomy_start:astronomy_end]
    assert 'data-layer="stars"' in astronomy
    assert 'data-layer="constellations"' in astronomy
    assert 'data-layer="planets"' in astronomy
    assert 'data-layer="atmosphere"' not in astronomy
    assert 'data-layer="landscape"' not in astronomy

    display_start = HTML.index('id="display-groups"')
    display_end = HTML.index('</aside>', display_start)
    display = HTML[display_start:display_end]
    assert 'data-layer="landscape"' in display
    assert 'data-layer="atmosphere"' in display
    assert 'data-layer="stars"' not in display

    assert 'const GROUP_PANELS=[' in APP
    assert '["astronomy-groups","astronomy-groups-button","astronomy-groups-close"]' in APP
    assert '["display-groups","display-groups-button","display-groups-close"]' in APP
    assert "function closeControlPanels(except=null)" in APP


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
    assert 'const sat=makeSkyObject({id,kind:"SATELLITE"' in APP
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
    assert "const AIRCRAFT_GRACE_MS=60000" in APP
    assert "aircraftRequestInFlight=false" in APP
    assert "if(!observer||!layers.aircraft||aircraftRequestInFlight)return;" in APP
    assert "setTimeout(()=>controller.abort(),8000)" in APP
    assert "cacheAge>8" in APP
    assert "lastSeenAt:wallNow" in APP
    assert "if(wallNow-lastSeenAt<=AIRCRAFT_GRACE_MS)next.set(id,prior)" in APP
    assert "retaining recent aircraft" in APP
    assert "aircraft=aircraft.filter" in APP


def test_satellite_refresh_runs_independently_of_display_toggle() -> None:
    assert 'satelliteRequestState="idle",satelliteRequestInFlight=false' in APP
    assert "if(!observer)return;" in APP
    assert 'satelliteRequestState="requesting"' in APP
    assert 'satelliteRequestState="ok"' in APP
    assert 'satelliteRequestState=satellites.length?"stale":"error"' in APP
    assert "setTimeout(()=>refreshSatellites(true),1500)" in APP
    assert 'if(key==="satellites"&&layers[key])refreshSatellites(true);' in APP
    assert "await refreshSatellites(true);" in APP


def test_aircraft_photo_inspector_contract() -> None:
    assert 'API_BASE+"/api/v1/aircraft/photo?"+qs' in APP
    assert 'const icaoHex=String(o.hex||"").trim().toLowerCase()' in APP
    assert 'new URLSearchParams({registration,aircraft_type:aircraftType,icao_hex:icaoHex})' in APP
    assert 'if(!photo?.image_path)' in APP
    assert 'const imageUrl=API_BASE+photo.image_path' in APP
    assert "const probe=new Image()" in APP
    assert 'photo.match==="icao"?"exact aircraft"' in APP
    assert 'const commonsSource=trustedExternalUrl(photo.source_url,"commons.wikimedia.org")' in APP
    assert 'const planeSpottersSource=trustedExternalUrl(photo.source_url,"www.planespotters.net")' in APP
    assert 'appendInspectorLink(credit,"More photos",photo.planespotters_url,"www.planespotters.net")' in APP
    assert "Aircraft photo source unavailable · ALEN illustration" in APP


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
    assert 'ThreadPoolExecutor(max_workers=6, thread_name_prefix="alen-sat")' in source
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
    assert "drawAircraftIcon(visualType,iconSize,aircraftInk" in APP
    assert 'data-sky-mode="day"' in css


def test_landscape_terrain_profile_is_higher_resolution_and_viewport_safe() -> None:
    assert "const z=10,azStep=3,eyeHeightM=1.7" in APP
    assert "const distances=[.25,.5,1,2,3,5,8,12,18,25,35,50,70]" in APP
    assert "const observerEyeElev=groundElev+eyeHeightM" in APP
    assert "const curvature=(distanceKm*distanceKm)/(2*EARTH_KM)*1000" in APP
    assert "const angle=Math.atan2(elev-observerEyeElev-curvature,distanceKm*1000)*RAD" in APP
    assert "const points=[],step=4,margin=Math.max(80,width*.08)" in APP
    assert "for(let x=-margin;x<=width+margin;x+=step)" in APP
    assert "ctx.lineTo(width+margin,horizonY)" in APP
    assert "ctx.lineTo(-margin,horizonY)" in APP


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


def test_richer_aircraft_labels() -> None:
    assert "const AIRLINE_PREFIXES={" in APP
    assert 'SHT:"British Airways"' in APP
    assert 'EZY:"easyJet"' in APP
    assert 'TOM:"TUI Airways"' in APP
    assert 'KLM:"KLM"' in APP
    assert "function aircraftOperator(a)" in APP
    assert 'const lines=meaning?[["Callsign:",callsign],["Meaning:",meaning]]:[["Callsign:",callsign],["Operator:",operator]]' in APP
    assert '["Callsign",o.callsign||o.name||"—"]' in APP
    assert '["Operator",aircraftOperator(o)]' in APP
    assert '["ICAO hex",o.hex||"—"]' in APP


def test_special_operation_aircraft_labels() -> None:
    assert '"0020":"HEMS / Air Ambulance"' in APP
    assert '"0023":"Search and Rescue (SAR)"' in APP
    assert '"0026":"Special Tasks"' in APP
    assert '"0032":"Police air support"' in APP
    assert '"0033":"Parachute dropping"' in APP
    assert '"7700":"General emergency"' in APP
    assert "function aircraftIsMilitary(a)" in APP
    assert "function aircraftSpecialMeaning(a)" in APP
    assert '["Meaning:",meaning]' in APP
    assert '["Squawk",o.squawk||"—"]' in APP
    assert '["Military",aircraftIsMilitary(o)?"Yes":"No"]' in APP


def test_aircraft_route_details_are_inspector_only() -> None:
    assert 'API_BASE+"/api/v1/aircraft/route?"+qs' in APP
    assert '["Departure","Looking up…"]' in APP
    assert '["Arrival","Looking up…"]' in APP
    assert 'setInspectorDetail("Departure"' in APP
    assert 'setInspectorDetail("Arrival"' in APP
    assert '["Squawk",o.squawk||"—"]' in APP
    assert '[["Callsign:",callsign],["Squawk:",squawk]' not in APP


def test_aircraft_motion_is_continuous_between_network_updates() -> None:
    assert "function destinationPoint(lat,lon,bearingDeg,distanceKm)" in APP
    assert "function blendAngle(current,target,k)" in APP
    assert "seenSeconds=clamp(Number(a.seen)||0,0,45)" in APP
    assert "measuredGs*1.852*seenSeconds/3600" in APP
    assert "displayGs:prior?.displayGs??measuredGs" in APP
    assert "displayTrack:prior?.displayTrack??measuredTrack" in APP
    assert "displayAltM:prior?.displayAltM??measuredAltM" in APP
    assert "targetLat:projected.lat,targetLon:projected.lon" in APP
    assert "const displayAdvanced=destinationPoint" in APP
    assert "const targetAdvanced=destinationPoint" in APP
    assert "a.displayTrack=blendAngle(a.displayTrack,a.track,motionK)" in APP
    assert "a.displayAltM+=(a.altM-a.displayAltM)*altitudeK" in APP
    assert "a.displayLat+=latError*positionK" in APP
    assert "a.displayLon+=lonError*positionK" in APP
    assert "correctionRemainingMs" not in APP
    assert "airborneAltAz(a.displayLat,a.displayLon,a.displayAltM??a.altM)" in APP
    assert "ctx.rotate(aircraftScreenRotation(a,q,p))" in APP


def test_multistate_layer_label_controls() -> None:
    assert 'const MULTISTATE_LAYERS=new Set(["stars","planets","airports","aircraft","satellites"])' in APP
    assert "function advancePhase(phase)" in APP
    assert 'function layerLabelsOn(key)' in APP
    assert 'btn.dataset.state=state' in APP
    assert 'state==="off"?"false":state==="labels"?"true":"mixed"' in APP
    assert 'if(layerLabelsOn("stars")' in APP
    assert 'if(layerLabelsOn("planets"))' in APP
    assert 'if(layerLabelsOn("airports"))' in APP
    assert 'layerLabelsOn("satellites")&&satGroup?.labels' in APP


def test_aircraft_groups_and_label_modes() -> None:
    assert "const AIRCRAFT_GROUPS={" in APP
    assert 'commercial:{label:"Commercial"' in APP
    assert 'military:{label:"Military"' in APP
    assert 'emergency:{label:"Emergency / special"' in APP
    assert 'other:{label:"Other"' in APP
    assert "function aircraftGroupKey(a)" in APP
    assert "function aircraftGroupEnabled(a)" in APP
    assert "function aircraftLabelsOn(a)" in APP
    assert 'data-aircraft-group="commercial"' in HTML
    assert 'data-aircraft-group="military"' in HTML
    assert 'data-aircraft-group="emergency"' in HTML
    assert 'data-aircraft-group="other"' in HTML
    assert 'id="aircraft-groups-button"' in HTML


def test_satellite_groups_use_multistate_buttons() -> None:
    assert '<button type="button" class="sat-group is-on sat-new" data-satellite-group="new"' in HTML
    assert '<input type="checkbox" data-satellite-group=' not in HTML
    assert "group.phase=advancePhase(group.phase)" in APP
    assert "group.enabled=phaseEnabled(group.phase)" in APP
    assert "group.labels=phaseLabels(group.phase)" in APP


def test_all_footer_group_buttons_are_wired_to_panels() -> None:
    pairs = (
        ("astronomy-groups-button", "astronomy-groups", "astronomy-groups-close"),
        ("aircraft-groups-button", "aircraft-groups", "aircraft-groups-close"),
        ("satellite-groups-button", "satellite-groups", "satellite-groups-close"),
        ("display-groups-button", "display-groups", "display-groups-close"),
    )
    for button_id, panel_id, close_id in pairs:
        assert f'id="{button_id}"' in HTML
        assert f'aria-controls="{panel_id}"' in HTML
        assert f'id="{panel_id}"' in HTML
        assert f'id="{close_id}"' in HTML
        mapping = f'["{panel_id}","{button_id}","{close_id}"]'
        assert mapping in APP

    assert 'entry.button?.addEventListener("click",()=>{' in APP
    assert 'entry.close?.addEventListener("click",()=>{' in APP
    assert 'if(entry.panel)entry.panel.hidden=!opening' in APP
    assert 'entry.button.setAttribute("aria-expanded",String(opening))' in APP
    assert 'function closeControlPanels(except=null)' in APP


def test_every_nested_footer_control_has_an_active_click_handler() -> None:
    astronomy_start = HTML.index('id="astronomy-groups"')
    astronomy_end = HTML.index('</aside>', astronomy_start)
    astronomy = HTML[astronomy_start:astronomy_end]
    for key in ("stars", "constellations", "planets"):
        assert f'data-layer="{key}"' in astronomy

    display_start = HTML.index('id="display-groups"')
    display_end = HTML.index('</aside>', display_start)
    display = HTML[display_start:display_end]
    for key in ("landscape", "atmosphere"):
        assert f'data-layer="{key}"' in display

    assert 'document.querySelectorAll("[data-layer]").forEach(btn=>{' in APP
    assert 'btn.addEventListener("click",()=>{' in APP
    assert 'layers[key]=!layers[key]' in APP
    assert 'layerPhases[key]=advancePhase(layerPhases[key])' in APP
    assert 'syncLayerButton(btn,key)' in APP

    aircraft_start = HTML.index('id="aircraft-groups"')
    aircraft_end = HTML.index('</aside>', aircraft_start)
    aircraft = HTML[aircraft_start:aircraft_end]
    for key in ("commercial", "military", "emergency", "other"):
        assert f'data-aircraft-group="{key}"' in aircraft
    assert 'document.querySelectorAll("[data-aircraft-group]").forEach(btn=>{' in APP
    assert 'group.phase=advancePhase(group.phase)' in APP
    assert 'group.enabled=phaseEnabled(group.phase)' in APP
    assert 'group.labels=phaseLabels(group.phase)' in APP

    satellite_start = HTML.index('id="satellite-groups"')
    satellite_end = HTML.index('</aside>', satellite_start)
    satellite = HTML[satellite_start:satellite_end]
    for key in (
        "new", "stations", "bright", "starlink", "oneweb", "kuiper",
        "navigation", "weather", "earth", "science", "amateur", "geo",
        "military", "cubesat", "debris",
    ):
        assert f'data-satellite-group="{key}"' in satellite
    assert 'document.querySelectorAll("[data-satellite-group]").forEach(btn=>{' in APP
    assert 'await refreshSatellites(true)' in APP


def test_four_step_label_cycle_is_complete() -> None:
    assert 'function advancePhase(phase){return ((Number(phase)||0)+1)%4}' in APP
    assert 'function phaseState(phase){return phase===2?"off":phase===0?"labels":"plain"}' in APP
    assert 'function phaseEnabled(phase){return phase!==2}' in APP
    assert 'function phaseLabels(phase){return phase===0}' in APP


def test_star_colours_adapt_to_sky_brightness() -> None:
    assert "function hexRgb(value)" in APP
    assert "function mixHexColor(a,b,t)" in APP
    assert "function starRenderPalette(baseColor,daylight)" in APP
    assert 'if(d<.3)return{fill:baseColor' in APP
    assert 'mixHexColor(baseColor,"#f8fbff",t)' in APP
    assert 'mixHexColor("#f8fbff","#08283f",t)' in APP
    assert "starPalette=starRenderPalette(o.color,sky.daylight)" in APP
    assert "ctx.shadowColor=starPalette.halo" in APP
    assert "ctx.fillStyle=starPalette.fill" in APP
    assert "ctx.strokeStyle=starPalette.outline" in APP
    assert "ctx.fillStyle=isSelected?(dayMode?"#08283f":"#dff9ff"):starPalette.label" in APP


def test_bright_stars_remain_visible_in_daylight() -> None:
    assert "function starVisibilityAlpha(visualMag,sky)" in APP
    assert "if(sky.daylight<.72)return night" in APP
    assert "const brightFactor=clamp((2.0-visualMag)/3.2,0,1)" in APP
    assert "const daylightFloor=.1+.28*brightFactor" in APP
    assert "const daylightAlpha=starVisibilityAlpha(visualMag,sky)" in APP


def test_satellite_group_fetch_has_fast_public_mirror_fallback() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert 'SATVISOR_MIRROR_URL = "https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak/json/{group}.json"' in source
    assert "records = self._fetch_group_mirror_json(group)" in source
    assert "def _fetch_group_mirror_json" in source
    assert "self.SATVISOR_MIRROR_URL.format(group=group.lower())" in source
    assert "timeout=10.0" in source


def test_aircraft_payload_exposes_adsb_category() -> None:
    source = Path("src/alen/aircraft.py").read_text(encoding="utf-8")
    assert '"category": str(aircraft.get("category") or "").strip().upper()' in source


def test_aircraft_icons_are_type_specific_and_heading_aware() -> None:
    assert "function aircraftVisualType(a)" in APP
    for kind in ("military", "helicopter", "glider", "balloon", "drone", "turboprop", "light", "jet"):
        assert f'return "{kind}"' in APP
    assert "function aircraftScreenRotation(a,q,p)" in APP
    assert "const ahead=destinationPoint(a.displayLat,a.displayLon,heading,lookAheadKm)" in APP
    assert "const aheadPoint=aheadAltAz?project(aheadAltAz.az,aheadAltAz.el):null" in APP
    assert "return Math.atan2(dx,-dy)" in APP
    assert "function drawAircraftIcon(kind,size,fill,stroke)" in APP
    assert 'if(kind==="helicopter")' in APP
    assert 'else if(kind==="glider")' in APP
    assert 'else if(kind==="military")' in APP
    assert 'else if(kind==="turboprop")' in APP
    assert 'else if(kind==="light")' in APP
    assert 'else if(kind==="balloon")' in APP
    assert 'else if(kind==="drone")' in APP
    assert "ctx.rotate(aircraftScreenRotation(a,q,p))" in APP
    assert "drawAircraftIcon(visualType,iconSize,aircraftInk" in APP
    assert 'strokeText("✈"' not in APP


def test_satellite_motion_is_continuous_between_feed_refreshes() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "now + timedelta(seconds=2)" in source
    assert '"azimuth_deg_next"' in source
    assert '"elevation_deg_next"' in source
    assert '"range_km_next"' in source
    assert '"azimuth_deg_next2"' in source
    assert '"elevation_deg_next2"' in source
    assert '"range_km_next2"' in source
    assert '"motion_horizon_seconds": 2' in source

    assert "const SATELLITE_GRACE_MS=15000" in APP
    assert "const SATELLITE_POSITION_RESPONSE_MS=850" in APP
    assert "function satelliteMotionRate(current,next,horizonSeconds,isAngle=false)" in APP
    assert "sat.displayAz=prior?.displayAz??az" in APP
    assert "sat.displayVec=prior?.displayVec??satelliteSkyVector" in APP
    assert "sat.targetVec=sample0" in APP
    assert "sat.vectorRate=vectorModel.rate" in APP
    assert "sat.vectorAccel=vectorModel.accel" in APP
    assert "sat.rangeRateKmMs=" in APP
    assert "function stepSatellites(now)" in APP
    assert "s.targetVec=normalizeSkyVector" in APP
    assert "s.displayVec=blendSkyVector" in APP
    assert "const display=satelliteVectorToAltAz(s.displayVec)" in APP
    assert "s.az=display.az;s.el=display.el;s.rangeKm=s.displayRangeKm" in APP
    assert "stepAircraft(now);stepSatellites(now);draw()" in APP
    assert 'satelliteRequestState=satellites.length?"stale":"error"' in APP
    assert "retaining recent satellites" in APP


def test_satellite_inspector_loads_useful_mission_metadata() -> None:
    assert 'API_BASE+"/api/v1/satellite/info?"+qs' in APP
    for label in (
        "What is it?",
        "Owner / operator",
        "Country",
        "Status",
        "Launch date",
        "Launch site",
        "Expected life",
        "Cost",
        "Orbital period",
        "Apogee",
        "Perigee",
        "Inclination",
        "Radar cross-section",
    ):
        assert f'["{label}","Looking up…"]' in APP
    assert 'fact.textContent=info.purpose' in APP
    assert 'if(o.kind==="SATELLITE")updateSatelliteInfo(o)' in APP


def test_satellite_inspector_supports_real_photos() -> None:
    assert 'trustedExternalUrl(photo?.image_url,"db-satnogs.freetls.fastly.net")' in APP
    assert 'trustedExternalUrl(photo?.image_url,"upload.wikimedia.org")' in APP
    assert 'const satnogsSource=trustedExternalUrl(photo.source_url,"db.satnogs.org")' in APP
    assert 'appendInspectorLink(credit,"Source",satnogsSource,"db.satnogs.org")' in APP
    assert "img-src 'self' data:" in HTML
    assert "No verified public image found · ALEN illustration" in APP


def test_satellite_visuals_are_category_specific_and_labels_declutter() -> None:
    assert "function satelliteVisualType(s)" in APP
    for kind in ("station", "constellation", "navigation", "earth", "debris", "cubesat", "satellite"):
        assert f'return"{kind}"' in APP or f'return "{kind}"' in APP
    assert "function drawSatelliteIcon(kind,size,fill,stroke)" in APP
    assert "function labelBoxOverlaps(box,boxes)" in APP
    assert "const satelliteLabelBoxes=[]" in APP
    assert "if(active||!labelBoxOverlaps(box,satelliteLabelBoxes))" in APP
    assert "drawSatelliteIcon(visualType,satSize,s.color" in APP


def test_satellite_motion_uses_curved_short_horizon_model() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "now + timedelta(seconds=4)" in source
    assert '"azimuth_deg_next2"' in source
    assert '"elevation_deg_next2"' in source
    assert '"range_km_next2"' in source
    assert "function satelliteMotionModel(current,next,next2,horizonSeconds,isAngle=false)" in APP
    assert "sat.vectorRate=vectorModel.rate" in APP
    assert "sat.vectorAccel=vectorModel.accel" in APP
    assert "sat.rangeAccelKmMs2=" in APP
    assert ".5*accel.x*rawDt*rawDt" in APP
    assert "s.vectorRate={x:rate.x+accel.x*rawDt" in APP


def test_satellite_motion_has_no_zenith_azimuth_singularity() -> None:
    assert "function satelliteSkyVector(az,el)" in APP
    assert "function normalizeSkyVector(v)" in APP
    assert "function satelliteVectorToAltAz(v)" in APP
    assert "function satelliteVectorModel(v0,v1,v2,horizonSeconds)" in APP
    assert "function blendSkyVector(current,target,k)" in APP
    assert "sat.displayVec=prior?.displayVec??satelliteSkyVector" in APP
    assert "sat.targetVec=sample0" in APP
    assert "s.displayVec=blendSkyVector" in APP
    assert "const display=satelliteVectorToAltAz(s.displayVec)" in APP
    assert "s.displayAz=display.az;s.displayEl=display.el" in APP
    assert "s.displayAz=blendAngle" not in APP
