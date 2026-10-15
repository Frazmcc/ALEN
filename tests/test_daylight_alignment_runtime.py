"""Daylight alignment reference contract and spherical distance regression."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")
HTML=Path("web/index.html").read_text(encoding="utf-8")


def test_alignment_controls_and_live_refresh():
    for key in ("sky-alignment-panel","sky-alignment-target","sky-alignment-az","sky-alignment-el","sky-alignment-readout"):
        assert f'id="{key}"' in HTML
    assert 'function updateAlignmentReadout(ms,now)' in APP
    assert 'updateAlignmentReadout(simTime,now);' in APP
    assert 'if(!observer)' in APP
    assert 'currentSunAltAz(ms)' in APP
    assert 'solarSystemRaDec(ms).moon' in APP
    assert 'mobileTrueAlignment?"Following approximate device heading with physical elevation."' in APP
    assert '"Following approximate device heading with lower-horizon framing (not true physical pointing alignment)."' in APP


def test_angular_separation_wrap_and_zenith():
    begin=APP.index("function angularSeparationDeg(")
    end=APP.index("function alignmentReference(",begin)
    snippet=APP[begin:end]
    js="""const DEG=Math.PI/180,RAD=180/Math.PI;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
""" + snippet + """
function close(a,b){if(Math.abs(a-b)>1e-6)throw Error(a+" != "+b)}
close(angularSeparationDeg(0,0,0,0),0);
close(angularSeparationDeg(359,0,1,0),2);
close(angularSeparationDeg(0,90,180,0),90);
close(angularSeparationDeg(0,0,180,0),180);
"""
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
