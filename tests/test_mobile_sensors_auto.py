"""Mobile sensor autostart and iOS permission gates."""
from pathlib import Path

APP=Path("web/app.js").read_text(encoding="utf-8")
HTML=Path("web/index.html").read_text(encoding="utf-8")


def test_mobile_startup_detects_device_and_requests_location():
    assert "initialiseMobileSkySensors();requestAnimationFrame(tick)" in APP
    assert "requestLocation();initialiseMobileSkySensors()" in APP
    assert "navigator.maxTouchPoints>1" in APP
    assert "void startCompassFollowing();" in APP


def test_apple_permission_requires_explicit_gesture():
    assert 'id="mobile-sensors-enable"' in HTML
    assert 'if(!requestPermission)return false;' in APP
    assert 'mobileSensorButton.addEventListener("click",async()=>{' in APP
    assert 'DeviceOrientationEvent.requestPermission()' in APP


def test_tilt_is_not_blocked_by_missing_heading():
    fragment=APP[APP.index("function onCompassOrientation(event){"):APP.index("const mobileSensorButton=",APP.index("function onCompassOrientation(event){"))]
    assert fragment.index("const rawTilt=deviceTiltElevation(event);")<fragment.index("if(heading===null)return;")
    assert "tiltOffsetDeg=0;" in APP
    assert "window.addEventListener(\"deviceorientationabsolute\",onCompassOrientation)" in APP
