"""Check ALEN's topocentric satellite projection at the user's recorded sky time.

The independently published 2026-10-12 CelesTrak-origin elements for
STARLINK-40075 (NORAD 100862) are used as a stable historical orbital input.
This validates the projection calculation, NOT the membership or location of
any unlabelled cluster in the screen recording.
"""
import math
from datetime import datetime, timezone

from sgp4.api import Satrec
from skyfield.api import EarthSatellite, load, wgs84

from alen.satellites import OrbitRecord, _topocentric_from_tle

LINE1 = "1 A0862U 26225H   26285.23989767  .00539702  00000+0  20494-2 0  9993"
LINE2 = "2 A0862  30.4983 238.7553 0000476 157.6256 202.4414 15.85148821  2199"
WHEN = datetime(2026, 10, 12, 22, 59, 56, tzinfo=timezone.utc)
LAT, LON, ALT_M = 55.7706, -4.0914, 185.0


def test_recorded_time_topocentric_position_matches_skyfield():
    satrec = Satrec.twoline2rv(LINE1, LINE2)
    orbit = OrbitRecord("STARLINK-40075", 100862, "2026-225H", satrec)
    alen_position = _topocentric_from_tle(orbit, WHEN, LAT, LON, ALT_M)
    assert alen_position is not None

    ts = load.timescale(builtin=True)
    reference = EarthSatellite.from_satrec(satrec, ts)
    observer = wgs84.latlon(LAT, LON, elevation_m=ALT_M)
    altitude, azimuth, range_distance = (reference - observer).at(ts.from_datetime(WHEN)).altaz()

    az_delta = math.radians(alen_position["azimuth_deg"] - azimuth.degrees)
    el_a = math.radians(alen_position["elevation_deg"])
    el_b = math.radians(altitude.degrees)
    cosine = math.sin(el_a) * math.sin(el_b) + math.cos(el_a) * math.cos(el_b) * math.cos(az_delta)
    separation = math.degrees(math.acos(max(-1.0, min(1.0, cosine))))
    assert separation < 0.1, f"ALEN differs from Skyfield by {separation:.5f} degrees"
    assert abs(alen_position["range_km"] - range_distance.km) < 1.0
