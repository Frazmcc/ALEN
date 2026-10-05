import { clamp, norm360 } from '@/sky/astronomy';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type SkyVector = {
  x: number;
  y: number;
  z: number;
};

export type SatelliteTrajectoryPoint = {
  timeMs: number;
  az: number;
  el: number;
  rangeKm: number;
  vec: SkyVector;
};

export type RawSatelliteTrajectoryPoint = {
  offset_seconds?: number;
  azimuth_deg?: number;
  elevation_deg?: number;
  range_km?: number;
};

export type RawSatellite = {
  norad?: number | string;
  name?: string;
  international_id?: string;
  azimuth_deg?: number;
  elevation_deg?: number;
  range_km?: number;
  azimuth_deg_next?: number;
  elevation_deg_next?: number;
  range_km_next?: number;
  azimuth_deg_next2?: number;
  elevation_deg_next2?: number;
  range_km_next2?: number;
  motion_horizon_seconds?: number;
  trajectory?: RawSatelliteTrajectoryPoint[];
  groups?: string[];
};

export type SatelliteTrack = {
  id: string;
  norad: string;
  name: string;
  internationalId: string;
  groups: string[];
  color: string;
  trajectory: SatelliteTrajectoryPoint[];
  receivedAtMs: number;
  sampleAgeMs: number;
};

export function satelliteSkyVector(az: number, el: number): SkyVector {
  const azr = az * DEG;
  const elr = el * DEG;
  const c = Math.cos(elr);

  return {
    x: c * Math.sin(azr),
    y: c * Math.cos(azr),
    z: Math.sin(elr),
  };
}

function normalizeSkyVector(vector: SkyVector): SkyVector {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z) || 1;

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function vectorToAltAz(vector: SkyVector) {
  const normalized = normalizeSkyVector(vector);
  const horizontal = Math.hypot(normalized.x, normalized.y);

  return {
    az: norm360(Math.atan2(normalized.x, normalized.y) * RAD),
    el: Math.atan2(normalized.z, horizontal) * RAD,
  };
}

function slerp(a: SkyVector, b: SkyVector, t: number): SkyVector {
  const av = normalizeSkyVector(a);
  const bv = normalizeSkyVector(b);
  const dot = clamp(
    av.x * bv.x + av.y * bv.y + av.z * bv.z,
    -1,
    1,
  );
  const angle = Math.acos(dot);

  if (angle < 1e-7) {
    return normalizeSkyVector({
      x: av.x + (bv.x - av.x) * t,
      y: av.y + (bv.y - av.y) * t,
      z: av.z + (bv.z - av.z) * t,
    });
  }

  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) < 1e-7) return av;

  const wa = Math.sin((1 - t) * angle) / sinAngle;
  const wb = Math.sin(t * angle) / sinAngle;

  return normalizeSkyVector({
    x: av.x * wa + bv.x * wb,
    y: av.y * wa + bv.y * wb,
    z: av.z * wa + bv.z * wb,
  });
}

export function trajectoryFromRaw(raw: RawSatellite) {
  const horizonSeconds =
    Number(raw.motion_horizon_seconds) > 0
      ? Number(raw.motion_horizon_seconds)
      : 2;

  const supplied = Array.isArray(raw.trajectory)
    ? raw.trajectory
    : [];

  const legacy: RawSatelliteTrajectoryPoint[] = [
    {
      offset_seconds: 0,
      azimuth_deg: raw.azimuth_deg,
      elevation_deg: raw.elevation_deg,
      range_km: raw.range_km,
    },
    {
      offset_seconds: horizonSeconds,
      azimuth_deg: raw.azimuth_deg_next,
      elevation_deg: raw.elevation_deg_next,
      range_km: raw.range_km_next,
    },
    {
      offset_seconds: horizonSeconds * 2,
      azimuth_deg: raw.azimuth_deg_next2,
      elevation_deg: raw.elevation_deg_next2,
      range_km: raw.range_km_next2,
    },
  ];

  const source = supplied.length >= 2 ? supplied : legacy;

  return source
    .map((point) => {
      const az = Number(point.azimuth_deg);
      const el = Number(point.elevation_deg);
      const rangeKm = Number(point.range_km);
      const timeMs =
        Math.max(0, Number(point.offset_seconds) || 0) * 1000;

      if (
        !Number.isFinite(az) ||
        !Number.isFinite(el) ||
        !Number.isFinite(rangeKm)
      ) {
        return null;
      }

      return {
        timeMs,
        az,
        el,
        rangeKm,
        vec: satelliteSkyVector(az, el),
      } satisfies SatelliteTrajectoryPoint;
    })
    .filter(
      (point): point is SatelliteTrajectoryPoint => point !== null,
    )
    .sort((a, b) => a.timeMs - b.timeMs);
}

export function sampleTrajectory(
  points: SatelliteTrajectoryPoint[],
  elapsedMs: number,
) {
  if (!points.length) return null;

  if (points.length === 1) {
    const point = points[0];
    return {
      az: point.az,
      el: point.el,
      rangeKm: point.rangeKm,
    };
  }

  const targetMs = Math.max(0, Number(elapsedMs) || 0);
  let a = points[0];
  let b = points[1];

  if (targetMs >= points[points.length - 1].timeMs) {
    a = points[points.length - 2];
    b = points[points.length - 1];
  } else {
    for (let index = 1; index < points.length; index += 1) {
      if (targetMs <= points[index].timeMs) {
        a = points[index - 1];
        b = points[index];
        break;
      }
    }
  }

  const span = Math.max(1, b.timeMs - a.timeMs);
  const fraction = clamp(
    (targetMs - a.timeMs) / span,
    0,
    targetMs > b.timeMs ? 10 : 1,
  );
  const vector = slerp(a.vec, b.vec, fraction);
  const horizontal = vectorToAltAz(vector);

  return {
    ...horizontal,
    rangeKm: Math.max(
      0,
      a.rangeKm + (b.rangeKm - a.rangeKm) * fraction,
    ),
  };
}

export function satelliteDepthCue(rangeKm: number) {
  const km = clamp(Number(rangeKm) || 42_000, 160, 42_000);
  const near =
    1 -
    clamp(
      (Math.log10(km) - Math.log10(160)) /
        (Math.log10(42_000) - Math.log10(160)),
      0,
      1,
    );

  return {
    radius: 1.35 + near * 1.35,
    halo: 2.5 + near * 3.5,
    opacity: 0.5 + near * 0.45,
  };
}

export function satelliteColor(groups: string[]) {
  const values = new Set(groups);

  if (
    values.has('fengyun-1c-debris') ||
    values.has('iridium-33-debris') ||
    values.has('cosmos-2251-debris') ||
    values.has('cosmos-1408-debris')
  ) {
    return '#ff6262';
  }
  if (values.has('last-30-days')) return '#68ff9a';
  if (values.has('stations')) return '#ffffff';
  if (values.has('visual')) return '#ffe082';
  if (values.has('starlink')) return '#64b5f6';
  if (values.has('oneweb')) return '#ab8cff';
  if (values.has('kuiper')) return '#50d0ff';
  if (values.has('gnss')) return '#4dd0c8';
  if (values.has('weather')) return '#6ed0ff';
  if (values.has('earth-resources')) return '#7ee787';
  if (values.has('science')) return '#e6a6ff';
  if (values.has('amateur')) return '#ffb86c';
  if (values.has('geo')) return '#ffd166';
  if (values.has('military')) return '#ff9f43';
  if (values.has('cubesat')) return '#b7f7d0';

  return '#ffe082';
}
