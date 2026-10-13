"""Regression tests for ALEN's nested sky toolbar and constellation overlays."""
import json
import re
import subprocess
from pathlib import Path

APP = Path("web/app.js").read_text(encoding="utf-8")
HTML = Path("web/index.html").read_text(encoding="utf-8")
API = Path("src/alen/api.py").read_text(encoding="utf-8")
SATELLITES = Path("src/alen/satellites.py").read_text(encoding="utf-8")


def test_constellations_resolve_all_star_ids_and_use_live_projection():
    payload = json.loads(Path("web/data/constellations.json").read_text(encoding="utf-8"))
    star_data = json.loads(Path("web/data/bright-stars.json").read_text(encoding="utf-8"))
    stars = {star["id"] for star in star_data["stars"]}
    figures = payload["figures"]
    assert len(figures) >= 20
    names = {fig["name"] for fig in figures}
    assert {"Orion", "Cassiopeia", "Ursa Major", "Cygnus", "Andromeda"} <= names
    for fig in figures:
        assert fig["name"] and fig["paths"]
        assert all(len(path) >= 2 for path in fig["paths"])
        assert all(star in stars for path in fig["paths"] for star in path)
    assert 'fetch("./data/constellations.json?v=1"' in APP
    assert 'const a=byId.get(path[i-1]),b=byId.get(path[i]);' in APP
    assert "if(!isAboveLandscape(a.az,a.el)||!isAboveLandscape(b.az,b.el))continue" in APP
    assert "if(layers.constellations)drawConstellations(byId,dayMode)" in APP
    assert "ctx.fillText(figure.name,x,y-12)" in APP
    assert 'id="constellation-status"' in HTML


def test_constellation_drawing_runs_against_a_mock_canvas():
    start = APP.index("function drawConstellations(byId,dayMode){")
    end = APP.index("function draw(){", start)
    source = APP[start:end]
    script = """
let brightStars=[{}],constellationFigures=[{name:"Test",paths:[["a","b","c"]]}];
let width=1200,height=800,lines=0,labels=0;
const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){lines++},stroke(){},fillText(){labels++}};
function project(az,el){return [az+500,el+300]}
function isAboveLandscape(){return true}
""" + source + """
const byId=new Map([["a",{az:0,el:20}],["b",{az:20,el:30}],["c",{az:40,el:20}]]);
drawConstellations(byId,false);
if(lines!==2||labels!==1)throw Error("Expected 2 constellation lines and 1 name: "+lines+"/"+labels);
"""
    subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True)


def test_label_modes_cycle_without_a_duplicate_off_state():
    assert 'function advancePhase(phase){return ((Number(phase)||0)+1)%3}' in APP
    assert 'function phaseState(phase){return phase===2?"off":phase===0?"labels":"plain"}' in APP
    program = """
function phaseState(phase){return phase===2?"off":phase===0?"labels":"plain"}
function advancePhase(phase){return ((Number(phase)||0)+1)%3}
let p=0,out=[];
for(let i=0;i<6;i++){out.push(phaseState(p));p=advancePhase(p)}
if(JSON.stringify(out)!==JSON.stringify(["labels","plain","off","labels","plain","off"]))throw Error(out.join(","));
"""
    subprocess.run(["node", "-e", program], check=True, capture_output=True, text=True)
    assert "else if(aircraftLabelsOn(a)){" in APP
    assert 'btn.classList.toggle("is-on",layers[key]);' in APP


def test_satellite_groups_are_not_silently_truncated():
    assert "requested = requested[:len(_satellites.ALLOWED_GROUPS)]" in API
    assert "][:len(self.ALLOWED_GROUPS)]" in SATELLITES
    assert "MAX_CACHE_GROUPS = 20" in SATELLITES
    assert "function updateSatelliteGroupCounts(objects=null)" in APP
    assert "updateSatelliteGroupCounts(satellites)" in APP
    assert 'btn.dataset.visible=value' in APP


def test_common_satellite_groups_default_to_active():
    for key in ("new", "stations", "bright", "starlink", "oneweb", "navigation", "weather", "earth"):
        assert re.search(rf'{key}:\{{label:[^\n]*enabled:true', APP)
        assert f'data-satellite-group="{key}" aria-pressed="mixed"' in HTML
    assert "Some categories start hidden to reduce load" in HTML
