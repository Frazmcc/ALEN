"""Regression tests for satellite catalogue freshness and trusted source fallback."""
from datetime import datetime, timezone
from time import time

from sgp4.api import Satrec
from alen.satellites import OrbitRecord, SatelliteProvider

LINE1 = "1 A0862U 26225H   26285.23989767  .00539702  00000+0  20494-2 0  9993"
LINE2 = "2 A0862  30.4983 238.7553 0000476 157.6256 202.4414 15.85148821  2199"
WHEN = datetime(2026, 10, 13, tzinfo=timezone.utc)


def record(epoch_day: str, norad: int = 100862) -> OrbitRecord:
    line1 = LINE1.replace("26285.23989767", epoch_day)
    return OrbitRecord(f"STARLINK-{norad}",norad,"2026-225H",Satrec.twoline2rv(line1,LINE2))


def test_fresh_current_catalogue_accepted_and_old_august_mirror_rejected():
    recent = tuple(record("26285.23989767", i) for i in range(10000,10130))
    stale = tuple(record("26242.23989767", i) for i in range(10000,10130))
    assert SatelliteProvider._catalog_fresh_enough("starlink", recent, WHEN)
    assert not SatelliteProvider._catalog_fresh_enough("starlink", stale, WHEN)
    assert not SatelliteProvider._catalog_fresh_enough("visual", stale, WHEN)


def test_fresh_alternative_wins_over_old_third_party_mirror(monkeypatch):
    provider=SatelliteProvider()
    stale=(record("26242.23989767"),)
    recent=(record("26285.23989767"),)
    hits=[]
    def source(name, value):
        def fetch(group):
            hits.append(name)
            return value
        return fetch
    monkeypatch.setattr(provider,"_fetch_group_json",source("primary",stale))
    monkeypatch.setattr(provider,"_fetch_group_alen_snapshot_json",source("alen",recent))
    monkeypatch.setattr(provider,"_fetch_group_mirror_json",source("thirdparty",stale))
    monkeypatch.setattr(provider,"_fetch_group_tle",source("tle",()))
    monkeypatch.setattr("alen.satellites.datetime", type("FixedDatetime", (datetime,), {"now": classmethod(lambda cls,tz=None: WHEN)}))
    assert provider._fetch_group("starlink")==recent
    assert hits==["alen"]


def test_stale_cached_elements_cannot_be_reused_on_fetch_failure(monkeypatch):
    provider=SatelliteProvider()
    stale=(record("26242.23989767"),)
    provider._cache["starlink"]=(time(),stale)
    monkeypatch.setattr(provider,"_fetch_group",lambda group: ())
    # Both the short-lived cache and the stale-if-error fallback reject old data.
    assert provider._load_group("starlink")==()


def test_snapshot_schema_rejects_stale_elements_without_changing_omm():
    from scripts.sync_orbital_feed import validated_snapshot
    fields={
        "NORAD_CAT_ID": 100862, "MEAN_MOTION": 15.3,
        "EPOCH": "2026-10-12T12:00:00.000000",
        "OBJECT_NAME": "STARLINK-40075",
    }
    assert validated_snapshot("starlink",[fields],WHEN) is not None
    old={**fields,"EPOCH":"2026-08-31T10:23:20.000000"}
    assert validated_snapshot("starlink",[old],WHEN) is None
    assert validated_snapshot("starlink",[],WHEN) is None


def test_primary_feed_is_used_when_managed_snapshot_is_stale(monkeypatch):
    provider=SatelliteProvider()
    stale=(record("26242.23989767"),)
    recent=(record("26285.23989767"),)
    hits=[]
    monkeypatch.setattr(provider,"_fetch_group_alen_snapshot_json",lambda group: hits.append("snapshot") or stale)
    monkeypatch.setattr(provider,"_fetch_group_json",lambda group: hits.append("primary") or recent)
    monkeypatch.setattr("alen.satellites.datetime", type("FixedDatetime", (datetime,), {"now": classmethod(lambda cls,tz=None: WHEN)}))
    assert provider._fetch_group("starlink")==recent
    assert hits==["snapshot","primary"]
