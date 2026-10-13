"""Fresh second-source TLE fallback for failed CelesTrak OMM requests."""
from datetime import datetime, timezone
from pathlib import Path

from alen.satellites import SatelliteProvider
from scripts.sync_orbital_feed import secondary_omm_snapshot, validated_snapshot

LINE1 = "1 A0862U 26225H   26285.23989767  .00539702  00000+0  20494-2 0  9993"
LINE2 = "2 A0862  30.4983 238.7553 0000476 157.6256 202.4414 15.85148821  2199"
NOW = datetime(2026, 10, 13, tzinfo=timezone.utc)


def test_tle_source_converts_to_omm_and_keeps_epoch_and_name():
    tle="STARLINK-40075\n"+LINE1+"\n"+LINE2+"\n"
    converted=secondary_omm_snapshot(tle)
    assert len(converted)==1
    assert converted[0]["OBJECT_NAME"]=="STARLINK-40075"
    assert converted[0]["NORAD_CAT_ID"]==100862
    assert validated_snapshot("starlink",converted,NOW) is not None


def test_tle_backup_is_checked_after_failed_omm_snapshots(monkeypatch):
    provider=SatelliteProvider()
    from sgp4.api import Satrec
    from alen.satellites import OrbitRecord
    record=OrbitRecord("STARLINK-40075",100862,"2026-225H",Satrec.twoline2rv(LINE1,LINE2))
    fresh=(record,)
    called=[]
    for source in ("_fetch_group_alen_snapshot_json","_fetch_group_json"):
        monkeypatch.setattr(provider,source,lambda group,source=source: called.append(source) or ())
    monkeypatch.setattr(provider,"_fetch_group_secondary_tle",lambda group: called.append("secondary") or fresh)
    monkeypatch.setattr("alen.satellites.datetime",type("FixedDatetime",(datetime,),{"now":classmethod(lambda cls,tz=None: NOW)}))
    assert provider._fetch_group("starlink")==fresh
    assert called==["_fetch_group_alen_snapshot_json","_fetch_group_json","secondary"]
    assert provider._group_source["starlink"]=="secondary_tle"


def test_independent_snapshot_workflow_uses_a_safe_tle_fallback():
    workflow=Path(".github/workflows/orbital-feed.yml").read_text(encoding="utf-8")
    script=Path("scripts/sync_orbital_feed.py").read_text(encoding="utf-8")
    backend=Path("src/alen/satellites.py").read_text(encoding="utf-8")
    assert "sgp4==2.27" in workflow
    assert "def secondary_omm_snapshot(" in script
    assert "legacyTleLimited" in script
    assert "if checked is None:" in script
    assert "caelo-works/tle-mirror" in backend
    assert "self._catalog_fresh_enough(group, records)" in backend
