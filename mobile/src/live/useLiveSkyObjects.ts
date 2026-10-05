import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { config } from '@/config';
import type { Observer } from '@/sky/astronomy';
import {
  projectAircraft,
  projectSatellite,
  type AircraftApiRecord,
  type SatelliteApiRecord,
} from '@/live/liveObjects';

type Snapshot<T> = {
  records: T[];
  receivedAt: number;
};

type SatelliteSnapshot = Snapshot<SatelliteApiRecord> & {
  sampleAgeSeconds: number;
};

type Options = {
  aircraftEnabled: boolean;
  satellitesEnabled: boolean;
};

type LiveFeedError = {
  aircraft: string | null;
  satellites: string | null;
};

const AIRCRAFT_REFRESH_MS = 3000;
const SATELLITE_REFRESH_MS = 6000;
const MOTION_TICK_MS = 100;

function endpoint(path: string, params: Record<string, string | number>) {
  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');

  return `${config.apiBaseUrl}${path}?${query}`;
}

export function useLiveSkyObjects(
  observer: Observer,
  { aircraftEnabled, satellitesEnabled }: Options,
) {
  const [aircraftSnapshot, setAircraftSnapshot] =
    useState<Snapshot<AircraftApiRecord>>({
      records: [],
      receivedAt: Date.now(),
    });
  const [satelliteSnapshot, setSatelliteSnapshot] =
    useState<SatelliteSnapshot>({
      records: [],
      receivedAt: Date.now(),
      sampleAgeSeconds: 0,
    });
  const [motionNow, setMotionNow] = useState(Date.now());
  const [error, setError] = useState<LiveFeedError>({
    aircraft: null,
    satellites: null,
  });

  useEffect(() => {
    if (!aircraftEnabled && !satellitesEnabled) return;

    const timer = setInterval(() => {
      setMotionNow(Date.now());
    }, MOTION_TICK_MS);

    return () => clearInterval(timer);
  }, [aircraftEnabled, satellitesEnabled]);

  useEffect(() => {
    let alive = true;
    let active = AppState.currentState === 'active';
    let aircraftBusy = false;
    let satelliteBusy = false;
    let aircraftTimer: ReturnType<typeof setInterval> | null = null;
    let satelliteTimer: ReturnType<typeof setInterval> | null = null;
    const controllers = new Set<AbortController>();

    setMotionNow(Date.now());
    if (!aircraftEnabled) {
      setAircraftSnapshot({ records: [], receivedAt: Date.now() });
    }
    if (!satellitesEnabled) {
      setSatelliteSnapshot({
        records: [],
        receivedAt: Date.now(),
        sampleAgeSeconds: 0,
      });
    }

    async function refreshAircraft() {
      if (!alive || !active || !aircraftEnabled || aircraftBusy) return;
      aircraftBusy = true;
      const controller = new AbortController();
      controllers.add(controller);

      try {
        const response = await fetch(
          endpoint('/api/v1/aircraft', {
            lat: observer.lat,
            lon: observer.lon,
            radius_nm: 43.4488,
            limit: 320,
          }),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as {
          aircraft?: AircraftApiRecord[];
        };
        if (!alive) return;

        setAircraftSnapshot({
          records: Array.isArray(payload.aircraft) ? payload.aircraft : [],
          receivedAt: Date.now(),
        });
        setError((current) => ({ ...current, aircraft: null }));
      } catch (caught) {
        if (!alive || controller.signal.aborted) return;
        const message =
          caught instanceof Error ? caught.message : 'Feed unavailable';
        setError((current) => ({ ...current, aircraft: message }));
      } finally {
        controllers.delete(controller);
        aircraftBusy = false;
      }
    }

    async function refreshSatellites() {
      if (!alive || !active || !satellitesEnabled || satelliteBusy) return;
      satelliteBusy = true;
      const controller = new AbortController();
      controllers.add(controller);

      try {
        const response = await fetch(
          endpoint('/api/v1/satellites', {
            lat: observer.lat,
            lon: observer.lon,
            altitude_m: 0,
            groups: 'last-30-days,stations,visual,starlink',
            limit: 320,
          }),
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as {
          satellites?: SatelliteApiRecord[];
          diagnostics?: {
            position_sample_age_seconds?: number;
          };
        };
        if (!alive) return;

        setSatelliteSnapshot({
          records: Array.isArray(payload.satellites)
            ? payload.satellites
            : [],
          receivedAt: Date.now(),
          sampleAgeSeconds: Number(
            payload.diagnostics?.position_sample_age_seconds ?? 0,
          ) || 0,
        });
        setError((current) => ({ ...current, satellites: null }));
      } catch (caught) {
        if (!alive || controller.signal.aborted) return;
        const message =
          caught instanceof Error ? caught.message : 'Feed unavailable';
        setError((current) => ({ ...current, satellites: message }));
      } finally {
        controllers.delete(controller);
        satelliteBusy = false;
      }
    }

    function stopPolling() {
      if (aircraftTimer) clearInterval(aircraftTimer);
      if (satelliteTimer) clearInterval(satelliteTimer);
      aircraftTimer = null;
      satelliteTimer = null;

      for (const controller of controllers) controller.abort();
      controllers.clear();
    }

    function startPolling() {
      if (!active || !alive) return;

      if (aircraftEnabled) {
        void refreshAircraft();
        aircraftTimer = setInterval(
          () => void refreshAircraft(),
          AIRCRAFT_REFRESH_MS,
        );
      }

      if (satellitesEnabled) {
        void refreshSatellites();
        satelliteTimer = setInterval(
          () => void refreshSatellites(),
          SATELLITE_REFRESH_MS,
        );
      }
    }

    const subscription = AppState.addEventListener('change', (state) => {
      const nextActive = state === 'active';
      if (nextActive === active) return;
      active = nextActive;
      stopPolling();

      if (active) {
        setMotionNow(Date.now());
        startPolling();
      }
    });

    startPolling();

    return () => {
      alive = false;
      stopPolling();
      subscription.remove();
    };
  }, [
    aircraftEnabled,
    observer.lat,
    observer.lon,
    satellitesEnabled,
  ]);

  const aircraft = useMemo(
    () =>
      aircraftSnapshot.records.flatMap((record) => {
        const projected = projectAircraft(
          record,
          observer,
          aircraftSnapshot.receivedAt,
          motionNow,
        );
        return projected ? [projected] : [];
      }),
    [aircraftSnapshot, motionNow, observer],
  );

  const satellites = useMemo(
    () =>
      satelliteSnapshot.records.flatMap((record) => {
        const projected = projectSatellite(
          record,
          satelliteSnapshot.receivedAt,
          satelliteSnapshot.sampleAgeSeconds,
          motionNow,
        );
        return projected ? [projected] : [];
      }),
    [motionNow, satelliteSnapshot],
  );

  return {
    aircraft,
    satellites,
    error,
  };
}
