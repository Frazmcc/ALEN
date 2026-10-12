"""Independent visible-pass event tests with deterministic SGP4 orbital elements.

Compare ALEN against Skyfield's event finder for rise, culmination, and set.
This verifies orbital geometry and timing, not contemporary element freshness.
"""
from datetime import datetime, timedelta, timezone
import math

from sgp4.api import Satrec
from skyfield.api import EarthSatellite, load, wgs84

from alen.satellites import OrbitRecord, _topocentric_from_tle

LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753"
LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667"


def _crossing(record, start, end, lat, lon, alt_m):
    """Bisect an ALEN horizon crossing to sub-second precision."""
    above_start = _topocentric_from_tle(record, start, lat, lon, alt_m)["elevation_deg"] >= 0
    for _ in range(16):
        middle = start + (end-start)/2
        above_middle = _topocentric_from_tle(record, middle, lat, lon, alt_m)["elevation_deg"] >= 0
        if above_middle == above_start:
            start = middle
        else:
            end = middle
    return start + (end-start)/2


def _alen_events(record, lat, lon, alt_m, start, end):
    events = []
    step = timedelta(seconds=15)
    previous_time = start
    previous_el = _topocentric_from_tle(record, previous_time, lat, lon, alt_m)["elevation_deg"]
    sample_times = []
    current_time = start + step
    while current_time <= end:
        point = _topocentric_from_tle(record, current_time, lat, lon, alt_m)
        elevation = point["elevation_deg"]
        if (previous_el < 0 <= elevation) or (previous_el >= 0 > elevation):
            events.append(("rise" if elevation >= 0 else "set",
                           _crossing(record, previous_time, current_time, lat, lon, alt_m)))
        if elevation >= 0:
            sample_times.append((current_time, elevation))
        previous_time, previous_el = current_time, elevation
        current_time += step
    # Find the culmination near each reference event, rather than relying on
    # sample maxima at the edge of the entire observing window.
    return events, sample_times


def test_visible_pass_rise_set_and_peak_against_skyfield():
    satrec = Satrec.twoline2rv(LINE1, LINE2)
    record = OrbitRecord("Vanguard 1", 5, "1958-002B", satrec)
    ts = load.timescale(builtin=True)
    reference = EarthSatellite.from_satrec(satrec, ts)
    start = datetime(2000, 6, 28, tzinfo=timezone.utc)
    end = start + timedelta(hours=24)
    observer = wgs84.latlon(55.8642, -4.2518, elevation_m=50.0)
    times, types = reference.find_events(observer, ts.from_datetime(start),
                                        ts.from_datetime(end), altitude_degrees=0)
    expected = [(("rise","peak","set")[int(kind)], instant.utc_datetime())
                for instant, kind in zip(times, types)]
    actual, samples = _alen_events(record, 55.8642, -4.2518, 50.0, start, end)
    assert len([kind for kind, _ in expected if kind == "rise"]) >= 1
    for kind, when in expected:
        if kind in ("rise", "set"):
            matching = [time for event_type, time in actual if event_type == kind]
            assert matching, f"no ALEN {kind} events"
            assert min(abs((time-when).total_seconds()) for time in matching) < 5.0
        else:
            close_samples = [(time,el) for time,el in samples
                             if abs((time-when).total_seconds()) < 300]
            assert close_samples, "no ALEN samples for culmination"
            peak_time, peak_elevation = max(close_samples, key=lambda sample: sample[1])
            assert abs((peak_time-when).total_seconds()) <= 20.0
            ref_alt,_,_ = (reference-observer).at(ts.from_datetime(when)).altaz()
            assert abs(peak_elevation-ref_alt.degrees) < 0.25
