"""Satellite refresh must preserve object identities and avoid abrupt blinking."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_successful_refresh_keeps_identity_but_removes_missing_satellites():
    start=APP.index("function satelliteVisibility(")
    end=APP.index("function satelliteRangeText(",start)
    js="""const SATELLITE_FADE_MS=1600;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
"""+APP[start:end]+"""
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const old={id:"sat:100",firstSeenAt:1000,lastSeenAt:1000,trajectory:[{}]};
const prior=new Map([[old.id,old]]);
let merged=mergeSatelliteContinuity(prior,[],11000,500);
check(merged.length===0,"authoritative response must not retain ghost");
const returned={id:"sat:100"};
merged=mergeSatelliteContinuity(prior,[returned],12000,700);
check(merged.length===1&&merged[0].firstSeenAt===1000,"preserve identity across refresh");
const fresh={id:"sat:101"};
merged=mergeSatelliteContinuity(new Map(),[fresh],20000,800);
check(satelliteVisibility(fresh,20000)===0,"new marker must fade in");
check(satelliteVisibility(fresh,22000)===1,"new marker fully visible");
"""
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr


def test_continuous_satellite_render_contract():
    assert "satellites=mergeSatelliteContinuity(previous,next,wallNow,frameNow)" in APP
    assert "const visibility=satelliteVisibility(s)" in APP
    assert "drawSatellitePoint(s,active,dayMode,visibility)" in APP
    assert "const SATELLITE_REFRESH_MS=5000" in APP
    assert "s.displayVec=blendSkyVector(" in APP
