"""Tests for the explicitly calibrated, portrait-only device tilt fallback."""
from pathlib import Path
import subprocess

APP=Path("web/app.js").read_text(encoding="utf-8")
HTML=Path("web/index.html").read_text(encoding="utf-8")


def test_tilt_control_contract():
    assert 'id="sky-tilt-calibrate"' in HTML
    assert 'function calibrateDeviceTilt()' in APP
    assert 'function deviceTiltElevation(event)' in APP
    assert 'if(tiltOffsetDeg!==null)' in APP
    assert 'lastDeviceBeta=null;tiltOffsetDeg=null;' in APP


def test_tilt_mapping_requires_calibration_and_upright_portrait():
    start=APP.index("let lastDeviceBeta=null")
    end=APP.index("let compassFollowing=false", 0) if False else APP.index("const compassToggle=",start)
    # The actual helper functions precede the compass element declaration.
    source=APP[start:end]
    js="""const screen={orientation:{angle:0}};
let pitch=35,minPitch=0;
const tiltCalibrationButton={addEventListener(){}};
const document={querySelector(){return tiltCalibrationButton}};
function skyViewMessage(){}
""" + source + """
function check(x,msg){if(!x)throw Error(msg)}
check(deviceTiltElevation({beta:90})===0,"upright baseline");
check(deviceTiltElevation({beta:60})===30,"portrait forward inclination");
check(deviceTiltElevation({beta:NaN})===null,"reject missing sensor");
check(deviceTiltElevation({beta:5})===null,"reject flat device");
screen.orientation.angle=90;
check(deviceTiltElevation({beta:90})===null,"reject landscape");
screen.orientation.angle=0;
check(!calibrateDeviceTilt(),"calibration requires a sample");
lastDeviceBeta=60;
check(calibrateDeviceTilt()&&tiltOffsetDeg===5,"align to current elevation");
"""
    result=subprocess.run(["node","-e",js],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
