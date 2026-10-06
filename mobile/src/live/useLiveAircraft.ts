import {
  AppState,
  type AppStateStatus,
} from 'react-native';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { config } from '@/config';
import type { Observer } from '@/sky/astronomy';
import { retryDelayMs } from '@/live/retryBackoff';
import {
  aircraftColor,
  aircraftVisualType,
  measuredAircraftPosition,
  predictAircraft,
  type AircraftTrack,
  type RawAircraft,
} from '@/live/aircraftMotion';

const REFRESH_MS = 2500;
const GRACE_MS = 60_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 30_000;
const RADIUS_NM = 43.4488;

export type AircraftFeedStatus =
  | 'off'
  | 'loading'
  | 'live'
  | 'stale'
  | 'error';

type AircraftResponse = {
  aircraft?: RawAircraft[];
  diagnostics?: {
    cache_age_seconds?: number;
    returned?: number;
    [key: string]: unknown;
  };
};

export function useLiveAircraft(
  observer: Observer,
  enabled: boolean,
) {
  const [tracks, setTracks] = useState<AircraftTrack[]>([]);
  const [status, setStatus] =
    useState<AircraftFeedStatus>(enabled ? 'loading' : 'off');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tracksRef = useRef<AircraftTrack[]>([]);
  const failureCountRef = useRef(0);
  const retryAfterRef = useRef(0);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;
    if (!force && Date.now() < retryAfterRef.current) return;
    if (force) {
      failureCountRef.current = 0;
      retryAfterRef.current = 0;
    }

    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;

    if (!tracksRef.current.length) setStatus('loading');
    setError(null);

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8000);

    try {
      const query = [
        `lat=${encodeURIComponent(String(observer.lat))}`,
        `lon=${encodeURIComponent(String(observer.lon))}`,
        `radius_nm=${RADIUS_NM}`,
        'limit=450',
      ].join('&');

      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/aircraft?${query}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`aircraft feed ${response.status}`);
      }

      const payload = (await response.json()) as AircraftResponse;
      const receivedAtMs = Date.now();
      const previous = new Map(
        tracksRef.current.map((track) => [track.id, track] as const),
      );
      const next = new Map<string, AircraftTrack>();

      for (const raw of Array.isArray(payload.aircraft)
        ? payload.aircraft
        : []) {
        const lat = Number(raw.lat);
        const lon = Number(raw.lon);
        const id = String(
          raw.hex ?? raw.flight ?? raw.registration ?? '',
        ).trim();

        if (
          !id ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon)
        ) {
          continue;
        }

        const measured = measuredAircraftPosition(raw);
        const prior = previous.get(id);
        const display = prior
          ? predictAircraft(prior, receivedAtMs)
          : measured;

        next.set(id, {
          id,
          icaoHex: String(raw.hex ?? '').trim().toUpperCase(),
          name:
            String(
              raw.flight ?? raw.registration ?? raw.hex ?? 'Aircraft',
            ).trim() || 'Aircraft',
          callsign: String(raw.flight ?? '').trim(),
          operator: String(raw.operator ?? '').trim(),
          registration: String(raw.registration ?? '').trim(),
          type: String(raw.type ?? 'Aircraft').trim(),
          category: String(raw.category ?? '').trim().toUpperCase(),
          squawk: String(raw.squawk ?? '').trim(),
          dbFlags: Number(raw.db_flags) || 0,
          visualType: aircraftVisualType(raw),
          color: aircraftColor(raw),
          receivedAtMs,
          lastSeenAtMs: receivedAtMs,
          startLat: display.lat,
          startLon: display.lon,
          startAltM: display.altM,
          startGs: display.gs,
          startTrack: display.track,
          targetLat: measured.lat,
          targetLon: measured.lon,
          targetAltM: measured.altM,
          targetGs: measured.gs,
          targetTrack: measured.track,
        });
      }

      for (const [id, prior] of previous) {
        if (next.has(id)) continue;
        if (receivedAtMs - prior.lastSeenAtMs <= GRACE_MS) {
          next.set(id, prior);
        }
      }

      const values = [...next.values()];
      tracksRef.current = values;
      setTracks(values);
      setStatus('live');
      failureCountRef.current = 0;
      retryAfterRef.current = 0;
    } catch (caught) {
      if (controller.signal.aborted && !timedOut) return;

      const message = timedOut
        ? 'Aircraft feed timed out'
        : caught instanceof Error
          ? caught.message
          : 'Aircraft feed unavailable';

      failureCountRef.current += 1;
      retryAfterRef.current =
        Date.now() +
        retryDelayMs(
          failureCountRef.current,
          RETRY_BASE_MS,
          RETRY_MAX_MS,
        );
      setError(message);
      setStatus(tracksRef.current.length ? 'stale' : 'error');
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [enabled, observer.lat, observer.lon]);

  useEffect(() => {
    const clearLiveTracks = (nextStatus: AircraftFeedStatus) => {
      abortRef.current?.abort();
      abortRef.current = null;
      tracksRef.current = [];
      setTracks([]);
      setStatus(nextStatus);
      setError(null);
    };

    const resetRetryState = () => {
      failureCountRef.current = 0;
      retryAfterRef.current = 0;
    };

    const resumeFresh = () => {
      resetRetryState();
      setError(null);
      setStatus(tracksRef.current.length ? 'stale' : 'loading');
      void refresh(true);
    };

    if (!enabled) {
      resetRetryState();
      clearLiveTracks('off');
      return;
    }

    resumeFresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, REFRESH_MS);

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          resumeFresh();
          return;
        }

        abortRef.current?.abort();
        abortRef.current = null;
        setStatus(tracksRef.current.length ? 'stale' : 'loading');
      },
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, refresh]);

  return {
    tracks,
    status,
    error,
    refresh,
  };
}
