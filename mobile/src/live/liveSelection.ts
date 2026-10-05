import type {
  Observer,
  PlanetPosition,
} from '@/sky/astronomy';
import type { Star } from '@/sky/catalog';
import { projectAltAz, type Viewport } from '@/sky/projection';
import type { SkyObjectDetail } from '@/components/SkyObjectSheet';
import {
  sampleTrajectory,
  type SatelliteTrack,
} from '@/live/satelliteMotion';
import {
  airborneAltAz,
  predictAircraft,
  type AircraftTrack,
  type PredictedAircraft,
} from '@/live/aircraftMotion';

export type PositionedStar = Star & {
  az: number;
  el: number;
};

export type SkySelection =
  | { kind: 'star'; id: string }
  | { kind: 'planet'; id: string }
  | { kind: 'satellite'; id: string }
  | { kind: 'aircraft'; id: string };

export type SatelliteSnapshot = {
  kind: 'satellite';
  id: string;
  name: string;
  color: string;
  az: number;
  el: number;
  rangeKm: number;
  track: SatelliteTrack;
};

export type AircraftSnapshot = {
  kind: 'aircraft';
  id: string;
  name: string;
  color: string;
  az: number;
  el: number;
  rangeKm: number;
  predicted: PredictedAircraft;
  track: AircraftTrack;
};

export type LiveObjectSnapshot =
  | SatelliteSnapshot
  | AircraftSnapshot;

export type SelectionLayers = {
  stars: boolean;
  planets: boolean;
  satellites: boolean;
  aircraft: boolean;
};

export type SelectionContext = {
  nowMs: number;
  stars: PositionedStar[];
  planets: PlanetPosition[];
  satelliteTracks: SatelliteTrack[];
  aircraftTracks: AircraftTrack[];
  observer: Observer;
  observerLabel: string;
  viewport: Viewport;
  starVisibility: number;
  layers: SelectionLayers;
};

export type ResolvedSelection = {
  selection: SkySelection;
  az: number;
  el: number;
  detail: SkyObjectDetail;
};

export function selectionKey(selection: SkySelection) {
  return `${selection.kind}:${selection.id}`;
}

export function satelliteSnapshot(
  track: SatelliteTrack,
  nowMs: number,
): SatelliteSnapshot | null {
  const elapsed =
    track.sampleAgeMs +
    Math.max(0, nowMs - track.receivedAtMs);
  const sample = sampleTrajectory(track.trajectory, elapsed);

  if (!sample || sample.el < 0) return null;

  return {
    kind: 'satellite',
    id: track.id,
    name: track.name,
    color: track.color,
    az: sample.az,
    el: sample.el,
    rangeKm: sample.rangeKm,
    track,
  };
}

export function aircraftSnapshot(
  track: AircraftTrack,
  observer: Observer,
  nowMs: number,
): AircraftSnapshot | null {
  const predicted = predictAircraft(track, nowMs);
  const horizontal = airborneAltAz(
    observer,
    predicted.lat,
    predicted.lon,
    predicted.altM,
  );

  if (horizontal.el < 0) return null;

  return {
    kind: 'aircraft',
    id: track.id,
    name: track.name,
    color: track.color,
    az: horizontal.az,
    el: horizontal.el,
    rangeKm: horizontal.slantRangeKm,
    predicted,
    track,
  };
}

export function liveObjectSnapshots({
  satelliteTracks,
  aircraftTracks,
  observer,
  nowMs,
  includeSatellites,
  includeAircraft,
}: {
  satelliteTracks: SatelliteTrack[];
  aircraftTracks: AircraftTrack[];
  observer: Observer;
  nowMs: number;
  includeSatellites: boolean;
  includeAircraft: boolean;
}) {
  const snapshots: LiveObjectSnapshot[] = [];

  if (includeSatellites) {
    for (const track of satelliteTracks) {
      const snapshot = satelliteSnapshot(track, nowMs);
      if (snapshot) snapshots.push(snapshot);
    }
  }

  if (includeAircraft) {
    for (const track of aircraftTracks) {
      const snapshot = aircraftSnapshot(track, observer, nowMs);
      if (snapshot) snapshots.push(snapshot);
    }
  }

  return snapshots;
}

function finiteText(value: number, digits = 1, suffix = '') {
  return Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : '—';
}

export function resolveSelection(
  selection: SkySelection,
  context: SelectionContext,
): ResolvedSelection | null {
  if (selection.kind === 'star') {
    const star = context.stars.find((item) => item.id === selection.id);
    if (!star) return null;

    return {
      selection,
      az: star.az,
      el: star.el,
      detail: {
        kind: 'STAR',
        name: star.name,
        subtitle: star.designation,
        color: star.color,
        altitude: star.el,
        azimuth: star.az,
        rows: [
          ['Apparent magnitude', star.mag.toFixed(2)],
          ['Right ascension', `${star.ra.toFixed(4)}°`],
          ['Declination', `${star.dec.toFixed(4)}°`],
          [
            'Temperature',
            star.temperatureK
              ? `~${Math.round(star.temperatureK).toLocaleString()} K`
              : 'Not in catalogue',
          ],
        ],
      },
    };
  }

  if (selection.kind === 'planet') {
    const planet = context.planets.find((item) => item.id === selection.id);
    if (!planet) return null;

    return {
      selection,
      az: planet.az,
      el: planet.el,
      detail: {
        kind:
          planet.id === 'sun'
            ? 'STAR'
            : planet.id === 'moon'
              ? 'MOON'
              : 'PLANET',
        name: planet.name,
        subtitle: 'Solar System',
        color: planet.color,
        altitude: planet.el,
        azimuth: planet.az,
        rows: [
          ['Right ascension', `${planet.ra.toFixed(4)}°`],
          ['Declination', `${planet.dec.toFixed(4)}°`],
          ['Observer', context.observerLabel],
          [
            'Visibility',
            planet.el >= 0 ? 'Above the horizon' : 'Below the horizon',
          ],
        ],
      },
    };
  }

  if (selection.kind === 'satellite') {
    const track = context.satelliteTracks.find(
      (item) => item.id === selection.id,
    );
    if (!track) return null;

    const snapshot = satelliteSnapshot(track, context.nowMs);
    if (!snapshot) return null;

    return {
      selection,
      az: snapshot.az,
      el: snapshot.el,
      detail: {
        kind: 'SATELLITE',
        name: track.name,
        subtitle: `NORAD ${track.norad}`,
        color: track.color,
        altitude: snapshot.el,
        azimuth: snapshot.az,
        rows: [
          ['Distance', finiteText(snapshot.rangeKm, 0, ' km')],
          ['NORAD', track.norad],
          ['International ID', track.internationalId],
          [
            'Groups',
            track.groups.length ? track.groups.join(', ') : 'Visual',
          ],
        ],
      },
    };
  }

  const track = context.aircraftTracks.find(
    (item) => item.id === selection.id,
  );
  if (!track) return null;

  const snapshot = aircraftSnapshot(
    track,
    context.observer,
    context.nowMs,
  );
  if (!snapshot) return null;

  return {
    selection,
    az: snapshot.az,
    el: snapshot.el,
    detail: {
      kind: 'AIRCRAFT',
      name: track.name || track.registration || 'Aircraft',
      subtitle:
        [track.operator, track.registration]
          .filter(Boolean)
          .join(' · ') || track.type,
      color: track.color,
      altitude: snapshot.el,
      azimuth: snapshot.az,
      rows: [
        ['Callsign', track.callsign || '—'],
        ['Registration', track.registration || '—'],
        ['Aircraft type', track.type || '—'],
        ['Speed', finiteText(snapshot.predicted.gs, 0, ' kt')],
        ['Heading', finiteText(snapshot.predicted.track, 0, '°')],
        ['Slant range', finiteText(snapshot.rangeKm, 1, ' km')],
        ['Squawk', track.squawk || '—'],
      ],
    },
  };
}

export function nearestLiveObject(
  snapshots: LiveObjectSnapshot[],
  viewport: Viewport,
  x: number,
  y: number,
  maxDistancePx = 32,
) {
  let nearest: LiveObjectSnapshot | null = null;
  let nearestDistance = maxDistancePx;

  for (const snapshot of snapshots) {
    const point = projectAltAz(
      snapshot.az,
      snapshot.el,
      viewport,
    );
    if (!point) continue;

    const distance = Math.hypot(
      point.x - x,
      point.y - y,
    );

    if (distance <= nearestDistance) {
      nearest = snapshot;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function nearestSkySelection(
  context: SelectionContext,
  x: number,
  y: number,
): SkySelection | null {
  let best:
    | {
        selection: SkySelection;
        score: number;
      }
    | null = null;

  const consider = (
    selection: SkySelection,
    az: number,
    el: number,
    thresholdPx: number,
  ) => {
    if (el < 0) return;

    const point = projectAltAz(az, el, context.viewport);
    if (!point) return;

    const distancePx = Math.hypot(point.x - x, point.y - y);
    if (distancePx > thresholdPx) return;

    const score = distancePx / thresholdPx;
    if (!best || score < best.score) {
      best = { selection, score };
    }
  };

  if (context.layers.stars && context.starVisibility > 0.02) {
    for (const star of context.stars) {
      consider(
        { kind: 'star', id: star.id },
        star.az,
        star.el,
        16,
      );
    }
  }

  if (context.layers.planets) {
    for (const planet of context.planets) {
      consider(
        { kind: 'planet', id: planet.id },
        planet.az,
        planet.el,
        24,
      );
    }
  }

  const live = liveObjectSnapshots({
    satelliteTracks: context.satelliteTracks,
    aircraftTracks: context.aircraftTracks,
    observer: context.observer,
    nowMs: context.nowMs,
    includeSatellites: context.layers.satellites,
    includeAircraft: context.layers.aircraft,
  });

  for (const snapshot of live) {
    consider(
      { kind: snapshot.kind, id: snapshot.id },
      snapshot.az,
      snapshot.el,
      snapshot.kind === 'aircraft' ? 28 : 24,
    );
  }

  return best?.selection ?? null;
}
