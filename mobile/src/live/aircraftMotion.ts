import { clamp, norm360, type Observer } from '@/sky/astronomy';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_KM = 6371.0088;

export type RawAircraft = {
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
  alt_baro?: number | string;
  alt_geom?: number | string;
  gs?: number;
  track?: number;
  seen?: number;
  distance_km?: number;
};

export type AircraftVisualType =
  | 'jet'
  | 'turboprop'
  | 'helicopter'
  | 'light'
  | 'glider'
  | 'balloon'
  | 'drone'
  | 'military'
  | 'aircraft';

export type AircraftTrack = {
  id: string;
  name: string;
  callsign: string;
  operator: string;
  registration: string;
  type: string;
  category: string;
  squawk: string;
  dbFlags: number;
  visualType: AircraftVisualType;
  color: string;
  receivedAtMs: number;
  lastSeenAtMs: number;
  startLat: number;
  startLon: number;
  startAltM: number;
  startGs: number;
  startTrack: number;
  targetLat: number;
  targetLon: number;
  targetAltM: number;
  targetGs: number;
  targetTrack: number;
};

export type PredictedAircraft = {
  lat: number;
  lon: number;
  altM: number;
  gs: number;
  track: number;
};

function angularDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

function blendAngle(current: number, target: number, amount: number) {
  return norm360(
    current + angularDifference(target, current) * amount,
  );
}

export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
) {
  const angular = distanceKm / EARTH_KM;
  const bearing = bearingDeg * DEG;
  const lat1 = lat * DEG;
  const lon1 = lon * DEG;
  const sinLat2 =
    Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) *
      Math.sin(angular) *
      Math.cos(bearing);
  const lat2 = Math.asin(clamp(sinLat2, -1, 1));
  const y =
    Math.sin(bearing) *
    Math.sin(angular) *
    Math.cos(lat1);
  const x =
    Math.cos(angular) -
    Math.sin(lat1) * Math.sin(lat2);
  const lon2 = lon1 + Math.atan2(y, x);

  return {
    lat: lat2 * RAD,
    lon: ((lon2 * RAD + 540) % 360) - 180,
  };
}

function geodeticToEcef(latDeg: number, lonDeg: number, altM: number) {
  const a = 6_378_137;
  const e2 = 6.69437999014e-3;
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  return {
    x: (n + altM) * cosLat * Math.cos(lon),
    y: (n + altM) * cosLat * Math.sin(lon),
    z: (n * (1 - e2) + altM) * sinLat,
  };
}

export function airborneAltAz(
  observer: Observer,
  lat: number,
  lon: number,
  altM: number,
) {
  const obs = geodeticToEcef(observer.lat, observer.lon, 0);
  const target = geodeticToEcef(lat, lon, Math.max(0, altM));
  const dx = target.x - obs.x;
  const dy = target.y - obs.y;
  const dz = target.z - obs.z;
  const latr = observer.lat * DEG;
  const lonr = observer.lon * DEG;
  const east =
    -Math.sin(lonr) * dx + Math.cos(lonr) * dy;
  const north =
    -Math.sin(latr) * Math.cos(lonr) * dx -
    Math.sin(latr) * Math.sin(lonr) * dy +
    Math.cos(latr) * dz;
  const up =
    Math.cos(latr) * Math.cos(lonr) * dx +
    Math.cos(latr) * Math.sin(lonr) * dy +
    Math.sin(latr) * dz;
  const horizontalM = Math.hypot(east, north);
  const slantRangeM = Math.hypot(horizontalM, up);

  if (slantRangeM < 1) {
    return {
      az: 0,
      el: 90,
      slantRangeKm: 0,
    };
  }

  return {
    az: norm360(Math.atan2(east, north) * RAD),
    el: Math.atan2(up, horizontalM) * RAD,
    slantRangeKm: slantRangeM / 1000,
  };
}

function altitudeM(raw: RawAircraft) {
  const value = raw.alt_geom ?? raw.alt_baro;
  const feet = Number(value);
  return Number.isFinite(feet) ? Math.max(0, feet * 0.3048) : 0;
}

function isMilitary(raw: RawAircraft) {
  const operator = String(raw.operator ?? '').toUpperCase();
  const callsign = String(raw.flight ?? '').trim().toUpperCase();

  return (
    Boolean((Number(raw.db_flags) || 0) & 1) ||
    /(ROYAL AIR FORCE|RAF|ROYAL NAVY|ARMY AIR|MILITARY)/.test(operator) ||
    /^(RFR|RRR|NVY|AAC)/.test(callsign)
  );
}

function isEmergency(raw: RawAircraft) {
  const squawk = String(raw.squawk ?? '').padStart(4, '0');
  const callsign = String(raw.flight ?? '').trim().toUpperCase();
  const operator = String(raw.operator ?? '').toUpperCase();

  return (
    ['0020', '0023', '0026', '0032', '7500', '7600', '7700'].includes(
      squawk,
    ) ||
    /^(UKP|POLICE|HLE|HELIMED|COASTGUARD|RESCUE|BRITISH RESCUE)/.test(
      callsign,
    ) ||
    /(POLICE|AIR AMBULANCE|COASTGUARD)/.test(operator)
  );
}

export function aircraftVisualType(raw: RawAircraft): AircraftVisualType {
  const type = String(raw.type ?? '').trim().toUpperCase();
  const category = String(raw.category ?? '').trim().toUpperCase();

  if (isMilitary(raw) || category === 'A6') return 'military';
  if (
    category === 'A7' ||
    /^(H1|H2|H3|H4|H5|H6|H7|EC3|EC4|EC5|R22|R44|R66|B06|A109|A119|A139|AS50|S76|S92|UH60|CH47|AH64)/.test(
      type,
    )
  ) {
    return 'helicopter';
  }
  if (
    category === 'B1' ||
    /^(ASW|DG|LS[0-9]|ASK|SZD|JS[123]|GLID)/.test(type)
  ) {
    return 'glider';
  }
  if (category === 'B2') return 'balloon';
  if (category === 'B6') return 'drone';
  if (
    /^(AT4|AT7|AT8|DH8|DHC6|SF34|BE20|B350|PC12|C208|E120|F50|F27|L410|AN2[468])/.test(
      type,
    )
  ) {
    return 'turboprop';
  }
  if (
    category === 'A1' ||
    category === 'A2' ||
    /^(C1[05789][02368]|C2[01][068]|P28|PA[12-9]|SR2[02]|DA4[02]|DA2[04]|BE3[356]|M20|RV[0-9]|P06|P20|TB[129]|DR40)/.test(
      type,
    )
  ) {
    return 'light';
  }
  if (
    /^(A3[0124-9]|A2[02-9]|B7[0-9]{2}|E1[679][05]|E2[09][05]|CRJ|BCS|MD8|MD9|DC9|DC10|L101|GLF|CL3|CL6|C5[0-9]{2}|LJ[234567]|FA[5-9]X)/.test(
      type,
    )
  ) {
    return 'jet';
  }

  return 'aircraft';
}

export function aircraftColor(raw: RawAircraft) {
  if (isEmergency(raw)) return '#ff6262';
  if (isMilitary(raw)) return '#ff9f43';

  const callsign = String(raw.flight ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}/.test(callsign)) return '#64d8ff';

  return '#d9e8ff';
}

export function measuredAircraftPosition(raw: RawAircraft) {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const gs = Math.max(0, Number(raw.gs) || 0);
  const track = norm360(Number(raw.track) || 0);
  const seenSeconds = clamp(Number(raw.seen) || 0, 0, 45);
  const projected = destinationPoint(
    lat,
    lon,
    track,
    (gs * 1.852 * seenSeconds) / 3600,
  );

  return {
    lat: projected.lat,
    lon: projected.lon,
    altM: altitudeM(raw),
    gs,
    track,
  };
}

export function predictAircraft(
  track: AircraftTrack,
  nowMs: number,
): PredictedAircraft {
  const elapsedMs = Math.max(0, nowMs - track.receivedAtMs);
  const motionK = 1 - Math.exp(-elapsedMs / 1800);
  const altitudeK = 1 - Math.exp(-elapsedMs / 2200);
  const positionK = 1 - Math.exp(-elapsedMs / 4200);

  const gs =
    track.startGs + (track.targetGs - track.startGs) * motionK;
  const heading = blendAngle(
    track.startTrack,
    track.targetTrack,
    motionK,
  );
  const altM =
    track.startAltM +
    (track.targetAltM - track.startAltM) * altitudeK;

  const startAdvanceKm =
    (Math.max(0, track.startGs) * 1.852 * elapsedMs) /
    3_600_000;
  const targetAdvanceKm =
    (Math.max(0, track.targetGs) * 1.852 * elapsedMs) /
    3_600_000;

  const start = destinationPoint(
    track.startLat,
    track.startLon,
    track.startTrack,
    startAdvanceKm,
  );
  const target = destinationPoint(
    track.targetLat,
    track.targetLon,
    track.targetTrack,
    targetAdvanceKm,
  );

  return {
    lat: start.lat + (target.lat - start.lat) * positionK,
    lon: start.lon + angularDifference(target.lon, start.lon) * positionK,
    altM,
    gs,
    track: heading,
  };
}

export function aircraftDepthCue(rangeKm: number) {
  const km = clamp(Number(rangeKm) || 80, 1, 100);
  const near =
    1 -
    clamp(
      (Math.log10(km) - Math.log10(1)) /
        (Math.log10(100) - Math.log10(1)),
      0,
      1,
    );

  return {
    size: 5 + near * 6,
    opacity: 0.58 + near * 0.42,
  };
}
