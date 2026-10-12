"""Orbital-element freshness diagnostics: epoch age is not a guarantee of accuracy."""
from datetime import datetime, timedelta, timezone

from sgp4.api import Satrec
from alen.satellites import OrbitRecord, SatelliteProvider

LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753"
LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667"


def test_satellite_element_epoch_age():
    satrec = Satrec.twoline2rv(LINE1, LINE2)
    orbit = OrbitRecord("Vanguard", 5, "1958-002B", satrec)
    epoch = datetime(2000, 6, 27, tzinfo=timezone.utc)
    age = SatelliteProvider._orbit_epoch_age_days(orbit, epoch)
    assert age is not None
    assert abs(age) < 2.0
    later = SatelliteProvider._orbit_epoch_age_days(orbit, epoch+timedelta(days=10))
    assert later is not None
    assert abs((later-age)-10) < 0.01
    earlier = SatelliteProvider._orbit_epoch_age_days(orbit, epoch-timedelta(days=10))
    assert earlier is not None and earlier < -8


def test_satellite_epoch_diagnostics_are_visible_in_contract():
    from pathlib import Path
    app = Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert '"orbit_epoch_age_days"' in app
    for key in ("orbit_epoch_age_known", "orbit_epoch_age_unknown",
                "orbit_epoch_older_than_3_days", "orbit_epoch_older_than_7_days",
                "orbit_epoch_future_dated", "orbit_epoch_max_age_days"):
        assert f'"{key}"' in app
