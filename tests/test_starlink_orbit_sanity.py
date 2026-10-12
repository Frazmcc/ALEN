"""Prevent visually impossible Starlink ranges seen in the October 2026 capture.

The capture showed labelled Starlink objects at ~28,000 km, ~491,000 km,
and several million kilometres; those are invalid Starlink positions.
"""
from datetime import datetime, timedelta, timezone

from sgp4.api import Satrec
from alen.satellites import OrbitRecord, _physically_plausible_orbit_position

LINE1="1 A0862U 26225H   26285.23989767  .00539702  00000+0  20494-2 0  9993"
LINE2="2 A0862  30.4983 238.7553 0000476 157.6256 202.4414 15.85148821  2199"
WHEN=datetime(2026, 10, 12, 22, 59, 56, tzinfo=timezone.utc)


def test_starlink_rejects_impossible_ranges_from_recording():
    orbit=OrbitRecord("STARLINK-40075",100862,"2026-225H",Satrec.twoline2rv(LINE1,LINE2))
    assert _physically_plausible_orbit_position(orbit,{"starlink"},(6800.0,0.0,0.0),WHEN)
    for bad_radius in (6000.0, 28000.0, 55000.0, 125000.0, 491000.0, 2233000.0, 4073000.0):
        assert not _physically_plausible_orbit_position(orbit,{"starlink"},(bad_radius,0.0,0.0),WHEN), bad_radius
    assert not _physically_plausible_orbit_position(orbit,{"new"},(4073000.0,0.0,0.0),WHEN)
    # A high-orbit non-Starlink object must not be rejected for being GEO-sized.
    other=OrbitRecord("OTHER SATELLITE",100862,"2026-225H",orbit.satellite)
    assert _physically_plausible_orbit_position(other,{"geo"},(42164.0,0.0,0.0),WHEN)


def test_stale_low_orbit_elements_are_not_trusted():
    orbit=OrbitRecord("STARLINK-40075",100862,"2026-225H",Satrec.twoline2rv(LINE1,LINE2))
    assert not _physically_plausible_orbit_position(orbit,{"starlink"},(6800.0,0.0,0.0),WHEN+timedelta(days=45))


def test_invalid_position_numbers_are_not_rendered():
    orbit=OrbitRecord("OTHER SATELLITE",100862,"2026-225H",Satrec.twoline2rv(LINE1,LINE2))
    for coords in ((float("nan"),2.0,3.0),(float("inf"),2.0,3.0),None):
        assert not _physically_plausible_orbit_position(orbit,{"visual"},coords,WHEN)
