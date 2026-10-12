"""Temporary diagnostic: explain satellite validation losses using live data."""
from collections import Counter
from datetime import datetime, timezone
from math import isfinite, sqrt, pi
import json
import urllib.parse
import urllib.request

from alen.satellites import SatelliteProvider, _ecef_from_tle

NOW = datetime.now(timezone.utc)
def report(name, records):
    reasons=Counter()
    bad_examples=[]
    for record in records:
        ecef=_ecef_from_tle(record,NOW)
        if ecef is None:
            reasons["sgp4_propagation_error"]+=1;continue
        radius=sqrt(sum(v*v for v in ecef))
        mm=record.satellite.no_kozai*1440/(2*pi)
        age=SatelliteProvider._orbit_epoch_age_days(record,NOW)
        if not isfinite(radius) or not 6350<=radius<=2_000_000:
            reason="invalid_geocentric_radius"
        elif not 9<=mm<=18:
            reason="starlink_mean_motion_out_of_range"
        elif not 6450<=radius<=9000:
            reason="starlink_orbit_radius_out_of_range"
        elif age is None or abs(age)>14:
            reason="starlink_age_over_14_days"
        else:
            reason="accepted"
        reasons[reason]+=1
        if reason!="accepted" and len(bad_examples)<8:
            bad_examples.append({"norad":record.norad,"name":record.name,"age_days":age,"mean_motion":round(mm,4),"radius_km":round(radius,1),"reason":reason})
    print(name, "loaded",len(records),"breakdown",dict(reasons),flush=True)
    print("rejected examples:",json.dumps(bad_examples),flush=True)

provider=SatelliteProvider()
for group in ["starlink","stations","visual"]:
    print("Fetching actual orbital source:",group,flush=True)
    records=provider._fetch_group(group)
    report(group,records)
api="https://alen-api-lquw.onrender.com/api/v1/satellites?"
query=urllib.parse.urlencode({"lat":55.7706,"lon":-4.0914,"groups":"starlink,stations,visual","limit":20})
try:
    with urllib.request.urlopen(api+query,timeout=115) as response:
        data=json.load(response)
        print("Live production API diagnostics:",json.dumps(data.get("diagnostics",{})),flush=True)
except Exception as e:
    print("Live production probe unavailable:",str(e),flush=True)
