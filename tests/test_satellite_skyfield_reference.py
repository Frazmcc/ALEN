"""Independent observer-position verification against Skyfield.

This uses a fixed public SGP4 reference TLE to make CI deterministic: no
network call, live catalogue, current clock, or cached ephemeris is involved.
The ALEN conversion and Skyfield observer geometry must agree for several
geographies and times. Agreement is computational, not an accuracy promise
about the age or quality of any real-world orbital element set.
"""
import math
from datetime import datetime, timedelta, timezone

import pytest
from sgp4.api import Satrec
from skyfield.api import EarthSatellite, load, wgs84

from alen.satellites import OrbitRecord, _topocentric_from_tle

LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753"
LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667"


@pytest.mark.parametrize("latitude,longitude,height_m", [
    (55.8642, -4.2518, 50.0),
    (-33.8688, 151.2093, 80.0),
    (0.0, 0.0, 0.0),
    (64.1466, -21.9426, 30.0),
])
@pytest.mark.parametrize("elapsed_hours", [0, 1, 6, 12])
def test_alen_topocentric_agrees_with_skyfield(
    latitude: float, longitude: float, height_m: float, elapsed_hours: int,
) -> None:
    satrec = Satrec.twoline2rv(LINE1, LINE2)
    orbit = OrbitRecord("Vanguard 1", 5, "1958-002B", satrec)
    instant = datetime(2000, 6, 28, tzinfo=timezone.utc) + timedelta(hours=elapsed_hours)
    actual = _topocentric_from_tle(orbit, instant, latitude, longitude, height_m)
    assert actual is not None

    ts = load.timescale(builtin=True)
    reference_satellite = EarthSatellite.from_satrec(satrec, ts)
    observer = wgs84.latlon(latitude, longitude, elevation_m=height_m)
    altitude, azimuth, distance = (reference_satellite - observer).at(
        ts.from_datetime(instant)
    ).altaz()

    actual_az = math.radians(actual["azimuth_deg"])
    actual_el = math.radians(actual["elevation_deg"])
    expected_az = math.radians(azimuth.degrees)
    expected_el = math.radians(altitude.degrees)
    cosine = (
        math.sin(actual_el) * math.sin(expected_el)
        + math.cos(actual_el) * math.cos(expected_el) * math.cos(actual_az - expected_az)
    )
    angular_difference = math.degrees(math.acos(max(-1.0, min(1.0, cosine))))
    assert angular_difference < 0.1, (
        f"topocentric angular error {angular_difference:.6f} degrees "
        f"at {instant.isoformat()} from ({latitude}, {longitude})"
    )
    assert abs(actual["range_km"] - distance.km) < 1.0
