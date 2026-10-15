"""Regression tests for airport elevation and honest skyline fallback."""
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")
AIRPORTS = Path("src/alen/airports.py").read_text(encoding="utf-8")


def test_airport_height_is_supplied_by_provider():
    assert '"elevation_m": airport.elevation_m' in AIRPORTS
    assert 'row["elevation_ft"]' in AIRPORTS
    assert 'elevation_m=elevation_m' in AIRPORTS


def test_airports_no_longer_use_fake_elevation_offset():
    code = APP[APP.index("function airportDisplayObject(a){"):APP.index("function satelliteGroupEntries()", APP.index("function airportDisplayObject(a){"))]
    assert "horizonEl+1.6" not in code
    assert "actualEl=position?.el??null" in code
    assert "markerEl=visible?actualEl:horizonEl" in code
    assert 'visibility:actualEl===null?"elevation unavailable"' in code


def test_airport_geometry_distinguishes_visible_obstructed_and_unknown():
    start = APP.index("function airportDisplayObject(a){")
    end = APP.index("function satelliteGroupEntries()", start)
    code = APP[start:end]
    js = """
const RAD=180/Math.PI;
const norm360=x=>(x%360+360)%360;
const makeSkyObject=x=>x;
let observer={lat:0,lon:0,gpsAltM:10};
let terrainProfile=[{az:0,el:1}];
let terrainObserverElevation=10;
const terrainHorizonElevation=()=>1;
const airportGroundAltAz=(lat,lon,alt,observerAlt)=>({az:90,el:alt});
""" + code + """
const base={id:"airport:test",az:90,lat:1,lon:1,elevationM:2};
const visible=airportDisplayObject(base);
if(!visible.visibleAirport||visible.el!==2)throw Error("visible position lost");
const obstructed=airportDisplayObject({...base,elevationM:.5});
if(obstructed.visibleAirport||obstructed.el!==1)throw Error("terrain obstruction not respected");
const unknown=airportDisplayObject({...base,elevationM:null});
if(unknown.airportPositionKnown||unknown.visibility!=="elevation unavailable")throw Error("unknown elevation invented");
"""
    result = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr


def test_deployed_html_uses_new_airport_renderer_asset_version():
    html = Path("web/index.html").read_text(encoding="utf-8")
    assert '<script src="./app.js?v=1.6.17"></script>' in html
    assert '<script src="./app.js?v=1.6.10"></script>' not in html
    assert 'markerEl=visible?actualEl:horizonEl' in APP
