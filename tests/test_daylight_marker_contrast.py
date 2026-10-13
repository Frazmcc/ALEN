"""Ensure ALEN's daylight tracking markers stay legible without changing geometry."""
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")


def run_node(script: str) -> None:
    result = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, timeout=10
    )
    assert result.returncode == 0, result.stderr


def test_aircraft_screen_icon_minimum_and_distance_perspective() -> None:
    begin = APP.index("function aircraftMarkerSize(")
    end = APP.index("function drawAircraftIcon(", begin)
    source = APP[begin:end]
    run_node(
        "const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));\n"
        + source
        + """
const near=aircraftDepthCue(1,60),far=aircraftDepthCue(180,15);
if(!(near.size>far.size))throw Error("Original distance cue must survive");
if(!(aircraftMarkerSize(far,true)>=10))throw Error("Distant day icon not visible");
if(!(aircraftMarkerSize(far,false)>=5.5))throw Error("Night minimum disappeared");
if(!(aircraftMarkerSize(near,true)>aircraftMarkerSize(far,true)))throw Error("Near traffic must appear larger");
if(aircraftMarkerSize(far,true)>12)throw Error("Far icons too large");
"""
    )


def test_satellite_high_contrast_day_point_and_subtle_night_point() -> None:
    begin = APP.index("function satelliteDepthCue(")
    end = APP.index("function labelBoxOverlaps(", begin)
    source = APP[begin:end]
    run_node(
        """
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let fills=[],strokes=0,arcRadius=0;
const ctx={
 save(){},restore(){},beginPath(){},
 arc(x,y,r){arcRadius=r},
 fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha,radius:arcRadius})},
 stroke(){strokes++}
};
"""
        + source
        + """
const sat={rangeKm:36000,el:25,color:"#ffe082"};
const physical=satelliteDepthCue(sat.rangeKm,sat.el);
if(physical.radius>2)throw Error("Physical depth radius unexpectedly changed");
drawSatellitePoint(sat,false,true,1);
if(fills.length!==2)throw Error("Day marker should have exactly two point layers");
if(fills[0].color!=="#08283f"||fills[0].radius<3.7)throw Error("Missing dark sky-contrast ring");
if(fills[1].color!==sat.color||fills[1].radius<2.2)throw Error("Missing category-coloured centre");
if(fills[1].alpha<.85)throw Error("Day colour still fades into sky");
fills=[];drawSatellitePoint(sat,false,false,1);
if(fills.length!==2||fills[0].color!==sat.color||fills[0].alpha>=.15)throw Error("Night glint altered");
fills=[];drawSatellitePoint(sat,false,true,0);
if(fills.some(f=>f.alpha!==0))throw Error("Fade-in/hidden state not preserved");
"""
    )


def test_labels_and_geometric_projection_remain_connected() -> None:
    assert "iconSize=aircraftMarkerSize(depth,dayMode)" in APP
    assert 'ctx.fillStyle="rgba(250,253,255,.95)"' in APP
    assert 'ctx.strokeStyle="rgba(5,34,53,.96)"' in APP
    assert 'ctx.font="700 11px ui-monospace,monospace"' in APP
    assert 'else if(aircraftLabelsOn(a)){' in APP
    assert "const q=airborneAltAz(a.displayLat,a.displayLon,a.displayAltM??a.altM)" in APP
    assert "const p=project(q.az,q.el)" in APP
    assert "const depth=drawSatellitePoint(s,active,dayMode,visibility)" in APP
    assert "if(s.el<0||!isAboveLandscape(s.az,s.el))continue;const p=project(s.az,s.el)" in APP
