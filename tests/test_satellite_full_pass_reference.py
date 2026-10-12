"""Full-duration satellite apparent-motion checks against independent Skyfield geometry.

Offline deterministic historical TLE verification, not current observational accuracy.
Positions, observer-dependent perspective, and angular speed use identical UTC instants.
"""
from datetime import datetime, timedelta, timezone
import math

import pytest
from sgp4.api import Satrec
from skyfield.api import EarthSatellite, load, wgs84

from alen.satellites import OrbitRecord, _topocentric_from_tle

LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753"
LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667"


def angular_separation(a, b):
    az_a, el_a = math.radians(a["azimuth_deg"]), math.radians(a["elevation_deg"])
    az_b, el_b = math.radians(b["azimuth_deg"]), math.radians(b["elevation_deg"])
    cos_sep = math.sin(el_a)*math.sin(el_b)+math.cos(el_a)*math.cos(el_b)*math.cos(az_a-az_b)
    return math.degrees(math.acos(max(-1.0,min(1.0,cos_sep))))


@pytest.mark.parametrize("lat,lon,height", [
    (55.8642, -4.2518, 50.0),
    (-33.8688, 151.2093, 80.0),
    (0.0, 0.0, 0.0),
])
def test_full_orbit_motion_against_skyfield(lat, lon, height):
    satrec = Satrec.twoline2rv(LINE1, LINE2)
    record = OrbitRecord("Vanguard 1", 5, "1958-002B", satrec)
    ts = load.timescale(builtin=True)
    reference = EarthSatellite.from_satrec(satrec, ts)
    observer = wgs84.latlon(lat, lon, elevation_m=height)
    start = datetime(2000, 6, 28, tzinfo=timezone.utc)
    ours, independent = [], []
    # 96 minutes at 30-second steps: validates more than one typical LEO pass duration.
    for index in range(193):
        instant = start + timedelta(seconds=index*30)
        point = _topocentric_from_tle(record, instant, lat, lon, height)
        assert point is not None
        altitude, azimuth, distance = (reference-observer).at(ts.from_datetime(instant)).altaz()
        expected = {
            "azimuth_deg": azimuth.degrees,
            "elevation_deg": altitude.degrees,
            "range_km": distance.km,
        }
        assert angular_separation(point, expected) < 0.1
        assert abs(point["range_km"]-expected["range_km"]) < 1.0
        ours.append(point)
        independent.append(expected)

    # Comparing step-wise *angular displacement* catches incorrect perceived speed,
    # including misleading azimuth differences around 0/360 degrees and at zenith.
    for index in range(1,len(ours)):
        actual_speed = angular_separation(ours[index-1],ours[index])/30
        expected_speed = angular_separation(independent[index-1],independent[index])/30
        assert abs(actual_speed-expected_speed) < 0.002
        assert 0 <= actual_speed < 1.0

    # Check that observer location changes topocentric direction (parallax).
    other = _topocentric_from_tle(record,start,lat+0.5 if lat<89 else lat-0.5,lon,height)
    assert other is not None
    assert angular_separation(ours[0],other)>0.001
