from pathlib import Path

HTML = Path("web/index.html").read_text(encoding="utf-8")
APP = Path("web/app.js").read_text(encoding="utf-8")
CSS = Path("web/styles.css").read_text(encoding="utf-8")


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


def test_mobile_pinch_zoom_uses_multi_pointer_gesture() -> None:
    assert 'viewport-fit=cover' in HTML
    assert 'Pinch or use the mouse wheel to zoom' in HTML
    assert "const activePointers=new Map()" in APP
    assert "function pointerPair()" in APP
    assert "function beginPinch()" in APP
    assert 'canvas.addEventListener("pointerdown",e=>{' in APP
    assert 'canvas.addEventListener("pointermove",e=>{' in APP
    assert 'canvas.addEventListener("pointerup",e=>finishPointer(e,false))' in APP
    assert 'canvas.addEventListener("pointercancel",e=>finishPointer(e,true))' in APP
    assert "pinch.startFov*pinch.startDistance/distance" in APP
    assert "setFov(" in APP
    assert "touch-action:none" in CSS
    assert "-webkit-touch-callout:none" in CSS


def test_mobile_field_of_view_is_limited_by_screen_shape() -> None:
    assert "function fovLimits()" in APP
    assert "const min=18,maxHorizontal=130" in APP
    assert "const portraitOrNarrow=width<=900||height>width" in APP
    assert "const maxVertical=(portraitOrNarrow?120:138)*DEG" in APP
    assert "const verticalLimited=2*Math.atan(Math.tan(maxVertical/2)*aspect)*RAD" in APP
    assert "return{min,max:clamp(verticalLimited,48,maxHorizontal)}" in APP
    assert "setFov(fov)" in APP
    assert 'setFov(fov*(e.deltaY<0?.88:1.12))' in APP


def test_mobile_layout_respects_safe_areas_and_small_screens() -> None:
    for token in (
        "env(safe-area-inset-top)",
        "env(safe-area-inset-right)",
        "env(safe-area-inset-bottom)",
        "env(safe-area-inset-left)",
        "height:100dvh",
        "overscroll-behavior:none",
        "min-height:44px",
        "@media(max-height:520px) and (orientation:landscape)",
    ):
        assert token in CSS
    assert "max-height:calc(100dvh - 210px" in CSS
    assert "max-height:calc(100dvh - 112px" in CSS


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
    assert './app.js?v=1.6.9' in HTML
    assert './styles.css?v=0.9.2' in HTML


def test_live_location_and_horizon_contract() -> None:
    assert "navigator.geolocation.getCurrentPosition" in APP
    assert "navigator.geolocation.watchPosition" in APP
    assert 'id="location-status"' in HTML
    assert "function horizonBottomGap()" in APP
    assert 'document.querySelector(".layerbar")' in APP
    assert "footerHeight+10" in APP
    assert "function updateMinPitch()" in APP
    assert "pitch=minPitch" in APP
    assert "pitch=clamp(drag.pitch+dy/Math.max(height,1)*fov*.62,minPitch,89)" in APP
    assert "function traceTerrainSkyline()" in APP
    assert "function drawDistantTerrain(dayMode)" in APP
    assert "function drawLandscapeForeground()" not in APP
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
    assert "SGP4 · shared world-position trajectory" in APP
    assert 'id="aircraft-groups-button"' in HTML
    assert 'id="satellite-groups-button"' in HTML
    assert 'data-satellite-group="starlink" aria-pressed="mixed"' in HTML
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
    assert "const depth=drawSatellitePoint(s,active,dayMode)" in APP
    assert "drawSatelliteIcon" not in APP
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
    assert "const SATELLITE_REFRESH_MS=10000" in APP
    assert "function scheduleSatelliteRefresh(delayMs=SATELLITE_REFRESH_MS)" in APP
    assert "satelliteTimer=setTimeout(async()=>{" in APP
    assert 'function stepSatellites(now)' in APP
    assert "satelliteDiagnostics=data.diagnostics||null" in APP
    assert "satellite feed unavailable" in APP


def test_landscape_is_one_edge_to_edge_terrain_silhouette() -> None:
    assert "function drawDistantTerrain(dayMode)" in APP
    assert "function drawLandscapeForeground()" not in APP
    assert "function isAboveLandscape(az,el)" in APP
    assert "drawDistantTerrain(dayMode);" in APP
    assert "isAboveLandscape(o.az,o.el)" in APP
    assert "isAboveLandscape(q.az,q.el)" in APP
    assert "isAboveLandscape(s.az,s.el)" in APP
    assert "ctx.moveTo(0,points[0][1])" in APP
    assert "ctx.lineTo(width,height)" in APP
    assert "ctx.lineTo(0,height)" in APP
    draw_start = APP.index("function draw(){")
    draw_end = APP.index("function allSelectableObjects()", draw_start)
    draw = APP[draw_start:draw_end]
    assert draw.index("if(layers.stars)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.planets)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.aircraft)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("if(layers.satellites)") < draw.index("drawDistantTerrain(dayMode);")
    assert draw.index("drawDistantTerrain(dayMode);") < draw.index("if(layers.airports)")


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
    assert "if(!observer||!layers.aircraft||document.hidden)return;" in APP
    assert "if(aircraftRequestInFlight){" in APP
    assert "if(force)aircraftRefreshQueued=true;" in APP
    assert "setTimeout(()=>controller.abort(),8000)" in APP
    assert "cacheAge>8" in APP
    assert "lastSeenAt:wallNow" in APP
    assert "if(wallNow-lastSeenAt<=AIRCRAFT_GRACE_MS)next.set(id,prior)" in APP
    assert "retaining recent aircraft" in APP
    assert "aircraft=aircraft.filter" in APP


def test_visibility_resume_snaps_live_positions_without_elastic_correction() -> None:
    assert "aircraftResumePending=false,satelliteResumePending=false" in APP
    assert "aircraftSnapOnRefresh=false,satelliteSnapOnRefresh=false" in APP
    assert "aircraftAbortController=null,satelliteAbortController=null" in APP
    assert "aircraftAbortController?.abort()" in APP
    assert "satelliteAbortController?.abort()" in APP
    assert "aircraftResumePending=layers.aircraft" in APP
    assert "satelliteResumePending=layers.satellites" in APP
    assert "aircraftSnapOnRefresh=layers.aircraft" in APP
    assert "satelliteSnapOnRefresh=layers.satellites" in APP
    assert "if(layers.aircraft)refreshAircraft(true)" in APP
    assert "restartSatellitePolling(true)" in APP
    assert "if(aircraftResumePending)return;" in APP
    assert "if(satelliteResumePending)return;" in APP
    assert "displayLat:snapToFresh?projected.lat:" in APP
    assert "displayTrack:snapToFresh?measuredTrack:" in APP
    assert "sat.displayVec=snapToFresh?targetNow.vec:" in APP
    assert "aircraftResumePending=false" in APP
    assert "satelliteResumePending=false" in APP


def test_satellite_polling_pauses_when_not_visible_or_enabled() -> None:
    assert 'satelliteRequestState="idle",satelliteRequestInFlight=false,satelliteRefreshQueued=false' in APP
    assert "function stopSatellitePolling()" in APP
    assert "function scheduleSatelliteRefresh(delayMs=SATELLITE_REFRESH_MS)" in APP
    assert "function restartSatellitePolling(forceRefresh=false)" in APP
    assert "if(document.hidden||!observer||!layers.satellites)return;" in APP
    assert 'document.addEventListener("visibilitychange",()=>{' in APP
    assert "function pauseLiveDataForHiddenPage()" in APP
    assert "function resumeLiveDataAfterVisibility()" in APP
    assert "if(document.hidden)pauseLiveDataForHiddenPage();" in APP
    assert "else resumeLiveDataAfterVisibility();" in APP
    assert 'if(key==="satellites")restartSatellitePolling(layers[key]);' in APP
    assert "satelliteTimer=setInterval" not in APP


def test_aircraft_photo_inspector_contract() -> None:
    # Keep the direct browser path covered whenever the PR is revalidated.
    assert "function planeSpottersPhotoUrl(o)" in APP
    assert '"https://api.planespotters.net/pub/photos//hex/"' in APP
    assert 'params.set("reg",registration)' in APP
    assert 'params.set("icaoType",aircraftType)' in APP
    assert "function trustedPlaneSpottersImageUrl(value)" in APP
    assert 'host.endsWith(".plnspttrs.net")' in APP
    assert 'host.endsWith(".planespotters.net")' in APP
    assert 'const res=await fetch(directUrl,{mode:"cors",cache:"default",credentials:"omit"})' in APP
    assert 'const photos=data?.photos||data?.images||[]' in APP
    assert 'photo.thumbnail?.src||photo.thumbnail' in APP
    assert 'image.src=imageUrl' in APP
    assert "const aircraftPhotoCache=new Map()" in APP
    assert "async function loadAircraftPhotoFallback" in APP
    assert 'API_BASE+"/api/v1/aircraft/photo?"+qs' in APP
    assert "Loading aircraft photo…" in APP
    assert "await loadAircraftFallbackChain(o,image,credit,token)" in APP
    assert "function exactAircraftModelSvg(o)" in APP
    assert "function loadRegionalServicePhoto(o,image,credit,token)" in APP
    assert "regional service representative · not the exact airframe" in APP
    assert "plain single-colour exact-model reference" in APP
    assert "Exact aircraft photo unavailable · exact-model artwork unavailable" in APP
    assert "https://*.plnspttrs.net" in HTML
    assert 'loading="eager"' in HTML
    assert 'fetchpriority="high"' in HTML


def test_sky_colour_tracks_local_solar_elevation() -> None:
    assert "function currentSunAltAz(ms)" in APP
    assert "function timeOfDaySky(sunEl)" in APP
    assert "{el:-18" in APP
    assert "{el:-12" in APP
    assert "{el:-6" in APP
    assert "{el:-1" in APP
    assert "{el:6" in APP
    assert "{el:25" in APP
    assert "warmRgb" in APP
    assert "const sun=currentSunAltAz(simTime),sky=timeOfDaySky(sun?.el)" in APP
    assert "drawSolarHorizonGlow(sun,sky)" in APP
    assert "sky.starVisibility" in APP


def test_atmosphere_is_anchored_to_real_horizon_elevation() -> None:
    assert "function screenElevationAtY(y)" in APP
    assert "return clamp(pitch+delta,-90,90)" in APP
    assert "function skyColourAtElevation(sky,elevationDeg)" in APP
    assert "function drawAtmosphericSky(sky)" in APP
    assert "skyColourAtElevation(sky,screenElevationAtY(height*fraction))" in APP
    assert "g.addColorStop(.62,layers.atmosphere?sky.mid:sky.top)" not in APP
    assert "drawHorizon(sky)" not in APP
    assert "glow.addColorStop(.72" not in APP


def test_sunrise_and_sunset_glow_stays_near_solar_horizon() -> None:
    assert "function drawSolarHorizonGlow(sun,sky)" in APP
    assert "const horizonY=screenYForElevation(0)" in APP
    assert "const rise=clamp((sun.el+12)/10,0,1),fall=clamp((12-sun.el)/10,0,1)" in APP
    assert "const sunPoint=project(sun.az,0)" in APP
    assert "ctx.scale(radiusX,radiusY)" in APP
    assert "ctx.arc(0,0,1,0,Math.PI*2)" in APP
    assert "horizonY-190" not in APP
    assert "horizonY+85" not in APP


def test_satellite_requests_are_bounded_and_non_overlapping() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "ThreadPoolExecutor" in source
    assert "as_completed" in source
    assert 'ThreadPoolExecutor(max_workers=6, thread_name_prefix="alen-sat")' in source
    assert "timeout=8.0" in source
    assert "if(satelliteRequestInFlight){" in APP
    assert "if(force)satelliteRefreshQueued=true;" in APP
    assert "const controller=new AbortController()" in APP
    assert "setTimeout(()=>controller.abort(),20000)" in APP
    assert "satelliteRequestInFlight=false" in APP
    assert "if(currentSignature!==requestSignature){" in APP
    assert "if(queued&&!document.hidden&&layers.satellites)setTimeout(()=>refreshSatellites(true),0);" in APP


def test_satellite_shared_snapshot_is_advanced_to_now() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "POSITION_BUCKET_SECONDS = 1" in source
    assert "MAX_POSITION_BUCKETS = 20" in source
    assert "MOTION_STEP_SECONDS = 2" in source
    assert "MOTION_FORECAST_SECONDS = 12" in source
    assert "def _world_positions(" in source
    assert "observer_frame = _observer_frame(latitude_deg, longitude_deg, altitude_m)" in source
    assert "position_sample_age_seconds" in source
    assert "position_cache_hits" in source
    assert "position_cache_misses" in source
    assert "const SATELLITE_MAX_SAMPLE_AGE_MS=10000" in APP
    assert "const sampleAgeMs=clamp((Number(satelliteDiagnostics?.position_sample_age_seconds)||0)*1000,0,SATELLITE_MAX_SAMPLE_AGE_MS)" in APP
    assert "const trajectory=satelliteTrajectory(raw,horizon)" in APP
    assert "targetNow=satelliteTrajectorySample(trajectory,sampleAgeMs)" in APP
    assert 'detail:"SGP4 · shared world-position trajectory"' in APP


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
    assert "function interpolateTerrainEdge(a,b,x)" in APP
    assert "function traceTerrainSkyline()" in APP
    assert "project(az,el)" in APP
    assert "points[0][0]=0" in APP
    assert "points[points.length-1][0]=width" in APP
    assert "ctx.moveTo(0,points[0][1])" in APP
    assert "ctx.lineTo(width,height)" in APP
    assert "ctx.lineTo(0,height)" in APP
    assert "margin=Math.max(80,width*.08)" not in APP
    assert "drawLandscapeForeground" not in APP


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
    assert "displayGs:snapToFresh?measuredGs:(prior?.displayGs??measuredGs)" in APP
    assert "displayTrack:snapToFresh?measuredTrack:(prior?.displayTrack??measuredTrack)" in APP
    assert "displayAltM:snapToFresh?measuredAltM:(prior?.displayAltM??measuredAltM)" in APP
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
    assert 'data-satellite-group="new" aria-pressed="mixed"' in HTML
    assert '<input type="checkbox" data-satellite-group=' not in HTML
    assert "for(const group of Object.values(SATELLITE_GROUPS)){group.labels=false;group.phase=group.enabled?1:2}" in APP
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
    assert "MOTION_FORECAST_SECONDS = 12" in source
    assert '"trajectory": trajectory' in source
    assert '"motion_forecast_seconds": self.MOTION_FORECAST_SECONDS' in source
    assert '"azimuth_deg_next"' in source
    assert '"azimuth_deg_next2"' in source

    assert "const SATELLITE_ERROR_GRACE_MS=30000" in APP
    assert "const SATELLITE_POSITION_RESPONSE_MS=420" in APP
    assert "function satelliteTrajectory(raw,horizonSeconds=2)" in APP
    assert "function satelliteTrajectorySample(points,elapsedMs)" in APP
    assert "function satelliteSlerp(a,b,t)" in APP
    assert "sat.displayAz=snapToFresh?targetNow.az:(prior?.displayAz??targetNow.az)" in APP
    assert "sat.displayVec=snapToFresh?targetNow.vec:(prior?.displayVec??targetNow.vec)" in APP
    assert "sat.trajectory=trajectory;sat.trajectoryReceivedAt=frameNow;sat.sampleAgeMs=sampleAgeMs" in APP
    assert "function stepSatellites(now)" in APP
    assert "const target=satelliteTrajectorySample(s.trajectory,elapsedMs)" in APP
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
    assert "function trustedISSTrackerImageUrl(value)" in APP
    assert 'host==="img-cdn.isstracker.pl"||host==="static.isstracker.pl"' in APP
    assert "function loadISSTrackerSatellitePhoto(o,image,credit,token)" in APP
    assert 'API_BASE+"/api/v1/satellite/photo?"+qs' in APP
    assert 'image.dataset.photoProvider="isstracker"' in APP
    assert 'const source=trustedExternalUrl(photo.source_url,"isstracker.pl")' in APP
    assert 'appendInspectorLink(credit,"Source",source,"isstracker.pl")' in APP
    assert 'if(o.kind==="SATELLITE")' in APP
    assert 'await loadISSTrackerSatellitePhoto(o,image,credit,token)' in APP
    assert 'const isstrackerImage=trustedISSTrackerImageUrl(photo?.image_url)' in APP
    assert 'trustedExternalUrl(photo?.image_url,"db-satnogs.freetls.fastly.net")' in APP
    assert 'trustedExternalUrl(photo?.image_url,"upload.wikimedia.org")' in APP
    assert 'const satnogsSource=trustedExternalUrl(photo.source_url,"db.satnogs.org")' in APP
    assert 'appendInspectorLink(credit,"Source",satnogsSource,"db.satnogs.org")' in APP
    assert "img-src 'self' data:" in HTML
    assert "No verified public image found · ALEN illustration" in APP


def test_satellite_visuals_are_point_like_with_depth_and_declutter() -> None:
    assert "function satelliteRangeText(rangeKm)" in APP
    assert "function satelliteDepthCue(rangeKm,active=false)" in APP
    assert "function drawSatellitePoint(s,active,dayMode)" in APP
    assert "Math.log10(km)" in APP
    assert "const depth=drawSatellitePoint(s,active,dayMode)" in APP
    assert "drawSatelliteIcon" not in APP
    assert "const MAX_SATELLITE_LABELS=18" in APP
    assert "const satelliteLabelBoxes=[];let satelliteLabelCount=0" in APP
    assert "satelliteLabelCount<MAX_SATELLITE_LABELS" in APP
    assert "function satelliteLabelText(s)" in APP
    assert "satelliteRangeText(s?.rangeKm)" in APP
    assert 'labelsEnabled=layerLabelsOn("satellites")&&satGroup?.labels' in APP
    assert "if((active||(labelsEnabled&&s.el>18))" in APP
    assert "ctx.roundRect(x,y,boxW,boxH,3)" in APP
    assert '["Line-of-sight distance",satelliteRangeText(o.rangeKm)]' in APP
    assert '["Depth cue","Nearer satellites appear slightly brighter and larger"]' in APP

def test_satellite_motion_uses_sgp4_forecast_trajectory() -> None:
    source = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "for offset_seconds in range(" in source
    assert "self.MOTION_FORECAST_SECONDS + self.MOTION_STEP_SECONDS" in source
    assert '"offset_seconds": offset_seconds' in source
    assert '"trajectory": trajectory' in source
    assert "function satelliteSlerp(a,b,t)" in APP
    assert "const supplied=Array.isArray(raw.trajectory)?raw.trajectory:[]" in APP
    assert "const vec=satelliteSlerp(a.vec,b.vec,t)" in APP
    assert "tMs>b.timeMs?10:1" in APP


def test_satellite_motion_has_no_zenith_azimuth_singularity() -> None:
    assert "function satelliteSkyVector(az,el)" in APP
    assert "function normalizeSkyVector(v)" in APP
    assert "function satelliteVectorToAltAz(v)" in APP
    assert "function satelliteSlerp(a,b,t)" in APP
    assert "function blendSkyVector(current,target,k)" in APP
    assert "sat.displayVec=snapToFresh?targetNow.vec:(prior?.displayVec??targetNow.vec)" in APP
    assert "const target=satelliteTrajectorySample(s.trajectory,elapsedMs)" in APP
    assert "s.displayVec=blendSkyVector" in APP
    assert "const display=satelliteVectorToAltAz(s.displayVec)" in APP
    assert "s.displayAz=display.az;s.displayEl=display.el" in APP
    assert "s.displayAz=blendAngle" not in APP


def test_aircraft_image_hard_fallback_policy() -> None:
    assert "const AIRCRAFT_MODEL_SPECS={" in APP
    assert 'B38M:{name:"Boeing 737 MAX 8"' in APP
    assert 'A20N:{name:"Airbus A320neo"' in APP
    assert 'EC35:{name:"Airbus H135 / EC135"' in APP
    assert 'EC45:{name:"Airbus H145 / EC145"' in APP
    assert 'A189:{name:"Leonardo AW189"' in APP
    assert 'S92:{name:"Sikorsky S-92"' in APP
    assert "function exactAircraftModelSvg(o)" in APP
    assert "plain single-colour exact-model reference" in APP
    assert "Exact model artwork unavailable" in APP
    assert "no substitute model shown" in APP
    assert 'if(photo.match!=="icao"&&photo.match!=="registration")return false' in APP
    assert "async function loadAircraftFallbackChain" in APP


def test_emergency_aircraft_use_regional_service_representative_before_model() -> None:
    assert "function aircraftServiceImageKind(a)" in APP
    assert 'return"police"' in APP
    assert 'return"air_ambulance"' in APP
    assert 'return"coastguard"' in APP
    assert "function aircraftServiceRegion(a)" in APP
    assert 'return"Scotland"' in APP
    assert 'return"Wales"' in APP
    assert 'return"Northern Ireland"' in APP
    assert "async function loadRegionalServicePhoto(o,image,credit,token)" in APP
    assert 'API_BASE+"/api/v1/aircraft/service-photo?"+qs' in APP
    assert 'photo.match!=="regional_service"' in APP
    assert "regional service representative · not the exact airframe" in APP
    assert "async function loadAircraftRegionalOrModelFallback" in APP
    regional = APP.index("if(await loadRegionalServicePhoto(o,image,credit,token))return true")
    model = APP.index("image.onerror=null;image.src=exactAircraftModelSvg(o)", regional)
    assert regional < model


def test_satellite_refresh_does_not_create_successful_response_ghosts() -> None:
    assert 'groups:sources.join(","),limit:"500"' in APP
    assert "const nextIds=new Set(next.map(s=>s.id))" not in APP
    assert "SATELLITE_ERROR_GRACE_MS" in APP
    assert (
        "satellites=satellites.filter(s=>wallNow-(Number(s.lastSeenAt)||wallNow)"
        "<=SATELLITE_ERROR_GRACE_MS)"
    ) in APP
