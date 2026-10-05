import { clamp, norm360, type Observer } from '@/sky/astronomy';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_A_KM = 6378.137;
const EARTH_E2 = 6.69437999014e-3;

export type AircraftApiRecord = {
  hex?: string;
  flight?: string;
  operator?: string;
  squawk?: string;
  db_flags?: number;
  registration?: string;
  type?: string;
  category?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string | null;
  alt_geom?: number | string | null;
  gs?: number | string | null;
  track?: number | string | null;
  seen?: number | string | null;
};

export type SatelliteTrajectoryPoint = {
  offset_seconds?: number;
  azimuth_deg?: number;
  elevation_deg?: number;
  range_km?: number;
};

export type SatelliteApiRecord = {
  norad?: number | string;
  name?: string;
  international_id?: string;
  azimuth_deg?: number;
  elevation_deg?: number;
  range_km?: number;
  trajectory?: SatelliteTrajectoryPoint[];
  groups?: string[];
};

export type LiveAircraft = {
  id: string;
  name: string;
  az: number;
  el: number;
  nextAz: number;
  nextEl: number;
  slantRangeKm: number;
  track: number;
  color: string;
};

export type LiveSatellite = {
  id: string;
  name: string;
  az: number;
  el: number;
  rangeKm: number;
  color: string;
  radius: number;
  halo: number;
  opacity: number;
};

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceKm: number,
) {
  const angular = Math.max(0, distanceKm) / 6371.0088;
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const bearing = norm360(bearingDeg) * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinAngular = Math.sin(angular);
  const cosAngular = Math.cos(angular);

  const nextLat = Math.asin(
    sinLat * cosAngular +
      cosLat * sinAngular * Math.cos(bearing),
  );
  const nextLon =
    lon +
    Math.atan2(
      Math.sin(bearing) * sinAngular * cosLat,
      cosAngular - sinLat * Math.sin(nextLat),
    );

  return {
    lat: nextLat * RAD,
    lon: ((nextLon * RAD + 540) % 360) - 180,
  };
}

function geodeticEcef(latDeg: number, lonDeg: number, altitudeM: number) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const altitudeKm = altitudeM / 1000;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = EARTH_A_KM / Math.sqrt(1 - EARTH_E2 * sinLat * sinLat);

  return {
    x: (n + altitudeKm) * cosLat * Math.cos(lon),
    y: (n + altitudeKm) * cosLat * Math.sin(lon),
    z: (n * (1 - EARTH_E2) + altitudeKm) * sinLat,
  };
}

function topocentricFromGeodetic(
  observer: Observer,
  targetLat: number,
  targetLon: number,
  targetAltitudeM: number,
) {
  const observerEcef = geodeticEcef(observer.lat, observer.lon, 0);
  const targetEcef = geodeticEcef(targetLat, targetLon, targetAltitudeM);
  const dx = targetEcef.x - observerEcef.x;
  const dy = targetEcef.y - observerEcef.y;
  const dz = targetEcef.z - observerEcef.z;
  const lat = observer.lat * DEG;
  const lon = observer.lon * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const east = -sinLon * dx + cosLon * dy;
  const north =
    -sinLat * cosLon * dx -
    sinLat * sinLon * dy +
    cosLat * dz;
  const up =
    cosLat * cosLon * dx +
    cosLat * sinLon * dy +
    sinLat * dz;
  const horizontal = Math.hypot(east, north);
  const slantRangeKm = Math.hypot(horizontal, up);

  if (slantRangeKm < 0.001) {
    return { az: 0, el: 90, slantRangeKm: 0 };
  }

  return {
    az: norm360(Math.atan2(east, north) * RAD),
    el: Math.atan2(up, horizontal) * RAD,
    slantRangeKm,
  };
}

function aircraftAltitudeM(record: AircraftApiRecord) {
  const value = record.alt_geom ?? record.alt_baro;
  const feet = finiteNumber(value, 0);
  return Math.max(0, feet * 0.3048);
}

function aircraftColor(record: AircraftApiRecord) {
  const flags = finiteNumber(record.db_flags, 0);
  const squawk = String(record.squawk ?? '').padStart(4, '0');
  if (['7500', '7600', '7700'].includes(squawk)) return '#ff6262';
  if ((flags & 1) === 1) return '#ff9f43';

  const category = String(record.category ?? '').toUpperCase();
  if (category === 'A7') return '#7ee787';
  if (category.startsWith('A')) return '#9fd9ff';
  return '#c7d7ea';
}

export function projectAircraft(
  record: AircraftApiRecord,
  observer: Observer,
  receivedAt: number,
  now: number,
): LiveAircraft | null {
  const lat = finiteNumber(record.lat, Number.NaN);
  const lon = finiteNumber(record.lon, Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const id = String(record.hex || record.flight || record.registration || '').trim();
  if (!id) return null;

  const speedKnots = Math.max(0, finiteNumber(record.gs, 0));
  const track = norm360(finiteNumber(record.track, 0));
  const sourceAgeSeconds = clamp(finiteNumber(record.seen, 0), 0, 60);
  const localAgeSeconds = clamp((now - receivedAt) / 1000, 0, 12);
  const totalAgeSeconds = sourceAgeSeconds + localAgeSeconds;
  const speedKmH = speedKnots * 1.852;
  const current = destinationPoint(
    lat,
    lon,
    track,
    speedKmH * totalAgeSeconds / 3600,
  );
  const ahead = destinationPoint(
    current.lat,
    current.lon,
    track,
    speedKmH * 4 / 3600,
  );
  const altitudeM = aircraftAltitudeM(record);
  const currentSky = topocentricFromGeodetic(
    observer,
    current.lat,
    current.lon,
    altitudeM,
  );
  const aheadSky = topocentricFromGeodetic(
    observer,
    ahead.lat,
    ahead.lon,
    altitudeM,
  );

  if (currentSky.el < 0) return null;

  return {
    id: `air:${id}`,
    name: String(record.flight || record.registration || record.hex || 'Aircraft').trim(),
    az: currentSky.az,
    el: currentSky.el,
    nextAz: aheadSky.az,
    nextEl: aheadSky.el,
    slantRangeKm: currentSky.slantRangeKm,
    track,
    color: aircraftColor(record),
  };
}

type SkyVector = {
  x: number;
  y: number;
  z: number;
};

function skyVector(azDeg: number, elDeg: number): SkyVector {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const cosEl = Math.cos(el);
  return {
    x: cosEl * Math.sin(az),
    y: cosEl * Math.cos(az),
    z: Math.sin(el),
  };
}

function normalizeVector(vector: SkyVector): SkyVector {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function vectorToAltAz(vector: SkyVector) {
  const value = normalizeVector(vector);
  return {
    az: norm360(Math.atan2(value.x, value.y) * RAD),
    el: Math.asin(clamp(value.z, -1, 1)) * RAD,
  };
}

function slerp(a: SkyVector, b: SkyVector, amount: number) {
  const av = normalizeVector(a);
  const bv = normalizeVector(b);
  const dot = clamp(av.x * bv.x + av.y * bv.y + av.z * bv.z, -1, 1);
  const angle = Math.acos(dot);

  if (angle < 1e-7) {
    return normalizeVector({
      x: av.x + (bv.x - av.x) * amount,
      y: av.y + (bv.y - av.y) * amount,
      z: av.z + (bv.z - av.z) * amount,
    });
  }

  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) < 1e-7) return av;

  const wa = Math.sin((1 - amount) * angle) / sinAngle;
  const wb = Math.sin(amount * angle) / sinAngle;
  return normalizeVector({
    x: av.x * wa + bv.x * wb,
    y: av.y * wa + bv.y * wb,
    z: av.z * wa + bv.z * wb,
  });
}

type PreparedTrajectoryPoint = {
  timeMs: number;
  az: number;
  el: number;
  rangeKm: number;
  vector: SkyVector;
};

function preparedTrajectory(record: SatelliteApiRecord): PreparedTrajectoryPoint[] {
  const supplied = Array.isArray(record.trajectory) ? record.trajectory : [];
  const fallback: SatelliteTrajectoryPoint[] = [{
    offset_seconds: 0,
    azimuth_deg: record.azimuth_deg,
    elevation_deg: record.elevation_deg,
    range_km: record.range_km,
  }];

  return (supplied.length >= 2 ? supplied : fallback)
    .map((point) => {
      const az = finiteNumber(point.azimuth_deg, Number.NaN);
      const el = finiteNumber(point.elevation_deg, Number.NaN);
      const rangeKm = finiteNumber(point.range_km, Number.NaN);
      if (![az, el, rangeKm].every(Number.isFinite)) return null;

      return {
        timeMs: Math.max(0, finiteNumber(point.offset_seconds, 0) * 1000),
        az,
        el,
        rangeKm,
        vector: skyVector(az, el),
      };
    })
    .filter((point): point is PreparedTrajectoryPoint => point !== null)
    .sort((a, b) => a.timeMs - b.timeMs);
}

function sampleTrajectory(points: PreparedTrajectoryPoint[], elapsedMs: number) {
  if (!points.length) return null;
  if (points.length === 1) {
    return {
      az: points[0].az,
      el: points[0].el,
      rangeKm: points[0].rangeKm,
    };
  }

  const time = Math.max(0, elapsedMs);
  let a = points[0];
  let b = points[1];

  if (time >= points[points.length - 1].timeMs) {
    a = points[points.length - 2];
    b = points[points.length - 1];
  } else {
    for (let index = 1; index < points.length; index += 1) {
      if (time <= points[index].timeMs) {
        a = points[index - 1];
        b = points[index];
        break;
      }
    }
  }

  const span = Math.max(1, b.timeMs - a.timeMs);
  const rawAmount = (time - a.timeMs) / span;
  const amount = clamp(rawAmount, 0, time > b.timeMs ? 1.75 : 1);
  const vector = slerp(a.vector, b.vector, amount);
  const altAz = vectorToAltAz(vector);

  return {
    az: altAz.az,
    el: altAz.el,
    rangeKm: Math.max(0, a.rangeKm + (b.rangeKm - a.rangeKm) * amount),
  };
}

function satelliteColor(groups: string[]) {
  if (groups.includes('last-30-days')) return '#68ff9a';
  if (groups.includes('stations')) return '#ffffff';
  if (groups.includes('visual')) return '#ffe082';
  if (groups.includes('starlink')) return '#64b5f6';
  return '#9fd9ff';
}

function satelliteDepth(rangeKm: number) {
  const distance = clamp(rangeKm || 42000, 160, 42000);
  const near =
    1 -
    clamp(
      (Math.log10(distance) - Math.log10(160)) /
        (Math.log10(42000) - Math.log10(160)),
      0,
      1,
    );

  return {
    radius: 1.35 + near * 1.35,
    halo: 2.5 + near * 3.5,
    opacity: 0.5 + near * 0.45,
  };
}

export function projectSatellite(
  record: SatelliteApiRecord,
  receivedAt: number,
  sampleAgeSeconds: number,
  now: number,
): LiveSatellite | null {
  const norad = String(record.norad ?? '').trim();
  if (!norad) return null;

  const points = preparedTrajectory(record);
  const elapsedMs =
    Math.max(0, sampleAgeSeconds) * 1000 +
    Math.max(0, now - receivedAt);
  const position = sampleTrajectory(points, elapsedMs);
  if (!position || position.el < 0) return null;

  const depth = satelliteDepth(position.rangeKm);
  const groups = Array.isArray(record.groups)
    ? record.groups.map((group) => String(group))
    : [];

  return {
    id: `sat:${norad}`,
    name: String(record.name || `NORAD ${norad}`).trim(),
    az: position.az,
    el: position.el,
    rangeKm: position.rangeKm,
    color: satelliteColor(groups),
    radius: depth.radius,
    halo: depth.halo,
    opacity: depth.opacity,
  };
}
