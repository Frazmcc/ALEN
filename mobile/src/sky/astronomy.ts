import { PLANET_INFO, type PlanetId } from '@/sky/catalog';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type Observer = {
  lat: number;
  lon: number;
};

export type AltAz = {
  az: number;
  el: number;
};

export type EquatorialPosition = {
  ra: number;
  dec: number;
};

export type PlanetPosition = AltAz &
  EquatorialPosition & {
    id: PlanetId;
    name: string;
    color: string;
    glyph: string;
  };

type OrbitalElements = {
  N0: number;
  Nd: number;
  i0: number;
  id: number;
  w0: number;
  wd: number;
  a0: number;
  ad: number;
  e0: number;
  ed: number;
  M0: number;
  Md: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function norm360(value: number) {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function angularDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

export function toJulian(ms: number) {
  return ms / 86_400_000 + 2_440_587.5;
}

export function gmstDeg(ms: number) {
  const jd = toJulian(ms);
  const t = (jd - 2_451_545.0) / 36_525;
  return norm360(
    280.46061837 +
      360.98564736629 * (jd - 2_451_545.0) +
      0.000387933 * t * t -
      (t * t * t) / 38_710_000,
  );
}

export function raDecToAltAz(
  ra: number,
  dec: number,
  ms: number,
  observer: Observer,
): AltAz {
  const lst = norm360(gmstDeg(ms) + observer.lon);
  const ha = angularDifference(lst, ra) * DEG;
  const lat = observer.lat * DEG;
  const declination = dec * DEG;

  const sinAlt =
    Math.sin(declination) * Math.sin(lat) +
    Math.cos(declination) * Math.cos(lat) * Math.cos(ha);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));

  const y = -Math.sin(ha) * Math.cos(declination);
  const x =
    Math.sin(declination) * Math.cos(lat) -
    Math.cos(declination) * Math.sin(lat) * Math.cos(ha);

  return {
    az: norm360(Math.atan2(y, x) * RAD),
    el: altitude * RAD,
  };
}

function eccentricAnomaly(meanAnomalyDeg: number, eccentricity: number) {
  const mean = norm360(meanAnomalyDeg) * DEG;
  let eccentric =
    mean +
    eccentricity *
      Math.sin(mean) *
      (1 + eccentricity * Math.cos(mean));

  for (let i = 0; i < 6; i += 1) {
    eccentric -=
      (eccentric -
        eccentricity * Math.sin(eccentric) -
        mean) /
      (1 - eccentricity * Math.cos(eccentric));
  }

  return eccentric;
}

function orbitalPosition(elements: OrbitalElements, days: number) {
  const node = (elements.N0 + elements.Nd * days) * DEG;
  const inclination = (elements.i0 + elements.id * days) * DEG;
  const perihelion = (elements.w0 + elements.wd * days) * DEG;
  const semiMajor = elements.a0 + elements.ad * days;
  const eccentricity = elements.e0 + elements.ed * days;
  const meanAnomaly = elements.M0 + elements.Md * days;
  const eccentric = eccentricAnomaly(meanAnomaly, eccentricity);

  const xv = semiMajor * (Math.cos(eccentric) - eccentricity);
  const yv =
    semiMajor *
    Math.sqrt(1 - eccentricity * eccentricity) *
    Math.sin(eccentric);
  const trueAnomaly = Math.atan2(yv, xv);
  const radius = Math.hypot(xv, yv);
  const argument = trueAnomaly + perihelion;

  return {
    x:
      radius *
      (Math.cos(node) * Math.cos(argument) -
        Math.sin(node) *
          Math.sin(argument) *
          Math.cos(inclination)),
    y:
      radius *
      (Math.sin(node) * Math.cos(argument) +
        Math.cos(node) *
          Math.sin(argument) *
          Math.cos(inclination)),
    z: radius * Math.sin(argument) * Math.sin(inclination),
  };
}

function eclipticToRaDec(
  x: number,
  y: number,
  z: number,
  days: number,
): EquatorialPosition {
  const obliquity = (23.4393 - 3.563e-7 * days) * DEG;
  const ye = y * Math.cos(obliquity) - z * Math.sin(obliquity);
  const ze = y * Math.sin(obliquity) + z * Math.cos(obliquity);

  return {
    ra: norm360(Math.atan2(ye, x) * RAD),
    dec: Math.atan2(ze, Math.hypot(x, ye)) * RAD,
  };
}

export function solarSystemRaDec(ms: number) {
  const days = toJulian(ms) - 2_451_543.5;

  const sunW = 282.9404 + 4.70935e-5 * days;
  const sunE = 0.016709 - 1.151e-9 * days;
  const sunM = 356.047 + 0.9856002585 * days;
  const sunEA = eccentricAnomaly(sunM, sunE);
  const sunXv = Math.cos(sunEA) - sunE;
  const sunYv = Math.sqrt(1 - sunE * sunE) * Math.sin(sunEA);
  const sunV = Math.atan2(sunYv, sunXv);
  const sunR = Math.hypot(sunXv, sunYv);
  const sunLon = sunV + sunW * DEG;
  const sx = sunR * Math.cos(sunLon);
  const sy = sunR * Math.sin(sunLon);

  const elements: Record<Exclude<PlanetId, 'sun' | 'moon'>, OrbitalElements> = {
    mercury: { N0: 48.3313, Nd: 3.24587e-5, i0: 7.0047, id: 5e-8, w0: 29.1241, wd: 1.01444e-5, a0: 0.387098, ad: 0, e0: 0.205635, ed: 5.59e-10, M0: 168.6562, Md: 4.0923344368 },
    venus: { N0: 76.6799, Nd: 2.4659e-5, i0: 3.3946, id: 2.75e-8, w0: 54.891, wd: 1.38374e-5, a0: 0.72333, ad: 0, e0: 0.006773, ed: -1.302e-9, M0: 48.0052, Md: 1.6021302244 },
    mars: { N0: 49.5574, Nd: 2.11081e-5, i0: 1.8497, id: -1.78e-8, w0: 286.5016, wd: 2.92961e-5, a0: 1.523688, ad: 0, e0: 0.093405, ed: 2.516e-9, M0: 18.6021, Md: 0.5240207766 },
    jupiter: { N0: 100.4542, Nd: 2.76854e-5, i0: 1.303, id: -1.557e-7, w0: 273.8777, wd: 1.64505e-5, a0: 5.20256, ad: 0, e0: 0.048498, ed: 4.469e-9, M0: 19.895, Md: 0.0830853001 },
    saturn: { N0: 113.6634, Nd: 2.3898e-5, i0: 2.4886, id: -1.081e-7, w0: 339.3939, wd: 2.97661e-5, a0: 9.55475, ad: 0, e0: 0.055546, ed: -9.499e-9, M0: 316.967, Md: 0.0334442282 },
    uranus: { N0: 74.0005, Nd: 1.3978e-5, i0: 0.7733, id: 1.9e-8, w0: 96.6612, wd: 3.0565e-5, a0: 19.18171, ad: -1.55e-8, e0: 0.047318, ed: 7.45e-9, M0: 142.5905, Md: 0.011725806 },
    neptune: { N0: 131.7806, Nd: 3.0173e-5, i0: 1.77, id: -2.55e-7, w0: 272.8461, wd: -6.027e-6, a0: 30.05826, ad: 3.313e-8, e0: 0.008606, ed: 2.15e-9, M0: 260.2471, Md: 0.005995147 },
  };

  const output: Record<PlanetId, EquatorialPosition> = {
    sun: eclipticToRaDec(sx, sy, 0, days),
    moon: { ra: 0, dec: 0 },
    mercury: { ra: 0, dec: 0 },
    venus: { ra: 0, dec: 0 },
    mars: { ra: 0, dec: 0 },
    jupiter: { ra: 0, dec: 0 },
    saturn: { ra: 0, dec: 0 },
    uranus: { ra: 0, dec: 0 },
    neptune: { ra: 0, dec: 0 },
  };

  for (const [id, orbital] of Object.entries(elements) as [
    Exclude<PlanetId, 'sun' | 'moon'>,
    OrbitalElements,
  ][]) {
    const position = orbitalPosition(orbital, days);
    output[id] = eclipticToRaDec(
      position.x + sx,
      position.y + sy,
      position.z,
      days,
    );
  }

  const moon = orbitalPosition(
    {
      N0: 125.1228,
      Nd: -0.0529538083,
      i0: 5.1454,
      id: 0,
      w0: 318.0634,
      wd: 0.1643573223,
      a0: 60.2666,
      ad: 0,
      e0: 0.0549,
      ed: 0,
      M0: 115.3654,
      Md: 13.0649929509,
    },
    days,
  );

  output.moon = eclipticToRaDec(moon.x, moon.y, moon.z, days);
  return output;
}

export function currentPlanetPositions(
  ms: number,
  observer: Observer,
): PlanetPosition[] {
  const positions = solarSystemRaDec(ms);

  return (Object.entries(positions) as [PlanetId, EquatorialPosition][]).map(
    ([id, equatorial]) => {
      const info = PLANET_INFO[id];
      const horizontal = raDecToAltAz(
        equatorial.ra,
        equatorial.dec,
        ms,
        observer,
      );

      return {
        id,
        ...equatorial,
        ...horizontal,
        name: info.name,
        color: info.color,
        glyph: info.glyph,
      };
    },
  );
}

export function skyPalette(sunElevation: number) {
  if (sunElevation <= -18) {
    return { top: '#01030a', middle: '#050c17', horizon: '#0e1c2b', stars: 1 };
  }
  if (sunElevation <= -6) {
    const t = (sunElevation + 18) / 12;
    return {
      top: mix('#01030a', '#06152f', t),
      middle: mix('#050c17', '#20375f', t),
      horizon: mix('#0e1c2b', '#665b70', t),
      stars: 1 - t * 0.5,
    };
  }
  if (sunElevation <= 6) {
    const t = (sunElevation + 6) / 12;
    return {
      top: mix('#06152f', '#3670b3', t),
      middle: mix('#20375f', '#65a0d2', t),
      horizon: mix('#665b70', '#b7cfe5', t),
      stars: 0.5 * (1 - t),
    };
  }

  return {
    top: '#3878be',
    middle: '#69a6da',
    horizon: '#b4d3ea',
    stars: 0,
  };
}

function mix(a: string, b: string, t: number) {
  const parse = (hex: string) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a);
  const cb = parse(b);
  const value = clamp(t, 0, 1);
  const channel = (index: number) =>
    Math.round(ca[index] + (cb[index] - ca[index]) * value)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
