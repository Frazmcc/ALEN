"""Test compass input validation using the real browser JavaScript implementation."""
from pathlib import Path
import subprocess

APP = Path("web/app.js").read_text(encoding="utf-8")
HTML = Path("web/index.html").read_text(encoding="utf-8")


def test_compass_control_and_manual_fallback() -> None:
    assert 'id="sky-compass-toggle"' in HTML
    assert 'DeviceOrientationEvent.requestPermission' in APP
    assert 'event.absolute!==true' in APP
    assert 'window.removeEventListener("deviceorientation",onCompassOrientation)' in APP
    assert 'stopCompassFollowing();yaw=norm360(drag.yaw' in APP
    assert 'stopCompassFollowing();yaw=norm360(pinch.startYaw' in APP


def test_compass_heading_rejects_relative_and_low_accuracy_sensor_data() -> None:
    start = APP.index("let compassFollowing=false;")
    end = APP.index('const skyViewCalibrationStatus=', start)
    functions = APP[start:end]
    script = (
        """
const norm360=n=>(n%360+360)%360;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const screen={orientation:{angle:0}};
let yaw=180;
const status={textContent:""};
const button={
 textContent:"",setAttribute(){},
 addEventListener(type,fn){this.click=fn;}
};
const document={querySelector:id=>id==="#sky-compass-toggle"||id==="#sky-tilt-calibrate"||id==="#sky-tilt-reverse"?button:status};
const window={addEventListener(){},removeEventListener(){}};
function skyViewMessage(){}
"""
        + functions
        + """
function check(ok,msg){if(!ok)throw Error(msg)}
check(absoluteCompassHeading({alpha:30,absolute:false})===null,
 "relative orientation must not masquerade as compass north");
check(absoluteCompassHeading({webkitCompassHeading:120,webkitCompassAccuracy:80})===null,
 "unreliable compass reading must be rejected");
check(absoluteCompassHeading({webkitCompassHeading:120,webkitCompassAccuracy:4})===120,
 "trusted absolute compass heading should be accepted");
check(absoluteCompassHeading({absolute:true,alpha:90})===270,
 "absolute alpha conversion should handle heading");
compassFollowing=true;onCompassOrientation({absolute:false,alpha:0});
check(yaw===180,"relative event must not steer sky");
compassFollowing=true;
onCompassOrientation({webkitCompassHeading:180.4,webkitCompassAccuracy:3});
check(yaw===180,"tiny compass jitter must not move sky");
onCompassOrientation({webkitCompassHeading:190,webkitCompassAccuracy:3});
check(yaw>180&&yaw<185,"moderate turn should update sky gently");
const beforeLarge=yaw;
onCompassOrientation({webkitCompassHeading:260,webkitCompassAccuracy:3});
check(yaw>beforeLarge&&yaw-beforeLarge<=9.001,"large turn should be bounded but responsive");
stopCompassFollowing();
check(compassFollowing===false,"stop must disable compass");
"""
    )
    proc = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=False, timeout=10
    )
    assert proc.returncode == 0, proc.stderr
