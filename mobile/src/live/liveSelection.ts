import type { Observer } from '@/sky/astronomy';
import { projectAltAz, type Viewport } from '@/sky/projection';
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

export type LiveSelection = {
  kind: 'satellite' | 'aircraft';
  id: string;
};

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
