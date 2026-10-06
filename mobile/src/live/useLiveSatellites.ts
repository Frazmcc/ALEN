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
  satelliteColor,
  trajectoryFromRaw,
  type RawSatellite,
  type SatelliteTrack,
} from '@/live/satelliteMotion';

const REFRESH_MS = 10_000;
const MAX_SAMPLE_AGE_MS = 10_000;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 60_000;
export type SatelliteFeedStatus =
  | 'off'
  | 'loading'
  | 'live'
  | 'stale'
  | 'error';

type SatelliteResponse = {
  satellites?: RawSatellite[];
  diagnostics?: {
    position_sample_age_seconds?: number;
    visible?: number;
    [key: string]: unknown;
  };
};

export function useLiveSatellites(
  observer: Observer,
  enabled: boolean,
  sources: string[],
) {
  const [tracks, setTracks] = useState<SatelliteTrack[]>([]);
  const [status, setStatus] =
    useState<SatelliteFeedStatus>(enabled ? 'loading' : 'off');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tracksRef = useRef<SatelliteTrack[]>([]);
  const failureCountRef = useRef(0);
  const retryAfterRef = useRef(0);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (Date.now() < retryAfterRef.current) return;

    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;

    if (!tracksRef.current.length) setStatus('loading');
    setError(null);

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);

    try {
      const query = [
        `lat=${encodeURIComponent(String(observer.lat))}`,
        `lon=${encodeURIComponent(String(observer.lon))}`,
        'altitude_m=0',
        `groups=${encodeURIComponent(sources.join(','))}`,
        'limit=320',
      ].join('&');

      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/satellites?${query}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`satellite feed ${response.status}`);
      }

      const payload = (await response.json()) as SatelliteResponse;
      const sampleAgeMs = Math.min(
        MAX_SAMPLE_AGE_MS,
        Math.max(
          0,
          Number(
            payload.diagnostics?.position_sample_age_seconds,
          ) * 1000 || 0,
        ),
      );
      const receivedAtMs = Date.now();
      const seen = new Set<string>();

      const next = (Array.isArray(payload.satellites)
        ? payload.satellites
        : []
      ).flatMap((raw) => {
        const norad = String(raw.norad ?? '').trim();
        if (!norad || seen.has(norad)) return [];
        seen.add(norad);

        const trajectory = trajectoryFromRaw(raw);
        if (!trajectory.length) return [];

        const groups = Array.isArray(raw.groups)
          ? raw.groups.map(String)
          : [];

        return [
          {
            id: `sat:${norad}`,
            norad,
            name:
              String(raw.name ?? '').trim() ||
              `NORAD ${norad}`,
            internationalId:
              String(raw.international_id ?? '').trim() || '—',
            groups,
            color: satelliteColor(groups),
            trajectory,
            receivedAtMs,
            sampleAgeMs,
          } satisfies SatelliteTrack,
        ];
      });

      tracksRef.current = next;
      setTracks(next);
      setStatus('live');
      failureCountRef.current = 0;
      retryAfterRef.current = 0;
    } catch (caught) {
      if (controller.signal.aborted && !timedOut) return;

      const message = timedOut
        ? 'Satellite feed timed out'
        : caught instanceof Error
          ? caught.message
          : 'Satellite feed unavailable';

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
  }, [enabled, observer.lat, observer.lon, sources]);

  useEffect(() => {
    const clearLiveTracks = (nextStatus: SatelliteFeedStatus) => {
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
      clearLiveTracks('loading');
      void refresh();
    };

    if (!enabled || !sources.length) {
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

        clearLiveTracks('loading');
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
