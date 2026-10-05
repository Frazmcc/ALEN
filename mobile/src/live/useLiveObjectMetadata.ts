import {
  useEffect,
  useState,
} from 'react';
import { config } from '@/config';
import type { SkySelection } from '@/live/liveSelection';
import type { SatelliteTrack } from '@/live/satelliteMotion';
import type { AircraftTrack } from '@/live/aircraftMotion';

export type LiveObjectMetadata = {
  loading: boolean;
  error: string | null;
  imageUrl?: string;
  imageCredit?: string;
  description?: string;
  rows: Array<[string, string]>;
};

type SatellitePhoto = {
  image_url?: string;
  image_path?: string;
  source_url?: string;
  credit?: string;
  license?: string;
};

type SatelliteInfo = {
  name?: string;
  object_type?: string;
  owner?: string;
  country?: string;
  status?: string;
  purpose?: string;
  launch_date?: string;
  launch_site?: string;
  decay_date?: string | null;
  life_expectancy?: string;
  cost?: string;
  period_minutes?: number | null;
  inclination_deg?: number | null;
  apogee_km?: number | null;
  perigee_km?: number | null;
  rcs_m2?: number | null;
  photo?: SatellitePhoto | null;
};

type Airport = {
  name?: string;
  iata?: string;
  icao?: string;
  location?: string;
  country?: string;
};

type AircraftRoute = {
  callsign?: string;
  airline_code?: string;
  departure?: Airport;
  arrival?: Airport;
  via?: Airport[];
  source?: string;
};

type AircraftPhoto = {
  image_path?: string;
  source_url?: string;
  title?: string;
  artist?: string;
  license?: string;
  match?: string;
  provider?: string;
};

const EMPTY: LiveObjectMetadata = {
  loading: false,
  error: null,
  rows: [],
};

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text && text !== 'None' ? text : '';
}

function alenImageUrl(value: unknown) {
  const path = clean(value);
  if (!path.startsWith('/api/v1/')) return undefined;
  return `${config.apiBaseUrl}${path}`;
}

function numberRow(
  label: string,
  value: unknown,
  suffix: string,
  digits = 0,
): [string, string] | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? [label, `${number.toFixed(digits)}${suffix}`]
    : null;
}

function airportLabel(airport?: Airport) {
  if (!airport) return '';

  const code =
    clean(airport.iata) ||
    clean(airport.icao);
  const name =
    clean(airport.name) ||
    clean(airport.location);

  if (code && name) return `${code} · ${name}`;
  return code || name;
}

function satelliteMetadata(info: SatelliteInfo | null): LiveObjectMetadata {
  if (!info) {
    return {
      ...EMPTY,
      description: 'No additional satellite metadata is currently available.',
    };
  }

  const rows: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    const text = clean(value);
    if (text) rows.push([label, text]);
  };

  add('Owner / operator', info.owner);
  add('Country', info.country);
  add('Status', info.status);
  add('Object type', info.object_type);
  add('Launch date', info.launch_date);
  add('Launch site', info.launch_site);
  add('Expected life', info.life_expectancy);
  add('Estimated cost', info.cost);

  for (const row of [
    numberRow('Orbital period', info.period_minutes, ' min', 1),
    numberRow('Inclination', info.inclination_deg, '°', 1),
    numberRow('Apogee', info.apogee_km, ' km', 0),
    numberRow('Perigee', info.perigee_km, ' km', 0),
  ]) {
    if (row) rows.push(row);
  }

  const photo = info.photo ?? null;
  const creditParts = [
    clean(photo?.credit),
    clean(photo?.license),
  ].filter(Boolean);

  return {
    loading: false,
    error: null,
    imageUrl: alenImageUrl(photo?.image_path),
    imageCredit: creditParts.join(' · ') || undefined,
    description: clean(info.purpose) || undefined,
    rows,
  };
}

function aircraftMetadata(
  route: AircraftRoute | null,
  photo: AircraftPhoto | null,
): LiveObjectMetadata {
  const rows: Array<[string, string]> = [];
  const departure = airportLabel(route?.departure);
  const arrival = airportLabel(route?.arrival);
  const via = Array.isArray(route?.via)
    ? route!.via
        .map(airportLabel)
        .filter(Boolean)
        .join(' → ')
    : '';

  if (departure) rows.push(['Departure', departure]);
  if (arrival) rows.push(['Arrival', arrival]);
  if (via) rows.push(['Via', via]);

  const routeDescription =
    departure && arrival
      ? `Route: ${departure} → ${arrival}`
      : departure
        ? `Departed from ${departure}`
        : arrival
          ? `Destination: ${arrival}`
          : undefined;

  const imageUrl = alenImageUrl(photo?.image_path);
  const creditParts = [
    clean(photo?.artist),
    clean(photo?.license),
  ].filter(Boolean);

  return {
    loading: false,
    error: null,
    imageUrl,
    imageCredit: creditParts.join(' · ') || undefined,
    description: routeDescription,
    rows,
  };
}

export function useLiveObjectMetadata(
  selection: SkySelection | null,
  satelliteTracks: SatelliteTrack[],
  aircraftTracks: AircraftTrack[],
) {
  const [metadata, setMetadata] =
    useState<LiveObjectMetadata>(EMPTY);

  const selectedSatellite =
    selection?.kind === 'satellite'
      ? satelliteTracks.find((item) => item.id === selection.id) ?? null
      : null;
  const selectedAircraft =
    selection?.kind === 'aircraft'
      ? aircraftTracks.find((item) => item.id === selection.id) ?? null
      : null;

  useEffect(() => {
    if (
      !selection ||
      (selection.kind !== 'satellite' && selection.kind !== 'aircraft')
    ) {
      setMetadata(EMPTY);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setMetadata({
      loading: true,
      error: null,
      rows: [],
    });

    const load = async () => {
      try {
        if (selection.kind === 'satellite') {
          const track = selectedSatellite;
          if (!track) {
            if (active) setMetadata(EMPTY);
            return;
          }

          const query = new URLSearchParams({
            norad: track.norad,
            name: track.name,
          });
          const response = await fetch(
            `${config.apiBaseUrl}/api/v1/satellite/info?${query.toString()}`,
            {
              headers: { Accept: 'application/json' },
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            throw new Error(`satellite details ${response.status}`);
          }

          const payload = (await response.json()) as {
            satellite?: SatelliteInfo | null;
          };

          if (active) {
            setMetadata(satelliteMetadata(payload.satellite ?? null));
          }
          return;
        }

        const track = selectedAircraft;
        if (!track) {
          if (active) setMetadata(EMPTY);
          return;
        }

        const routeRequest = track.callsign
          ? fetch(
              `${config.apiBaseUrl}/api/v1/aircraft/route?${new URLSearchParams({
                callsign: track.callsign,
              }).toString()}`,
              {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
              },
            )
          : Promise.resolve(null);

        const photoQuery = new URLSearchParams({
          registration: track.registration,
          aircraft_type: track.type,
          icao_hex: track.icaoHex,
        });
        const photoRequest = fetch(
          `${config.apiBaseUrl}/api/v1/aircraft/photo?${photoQuery.toString()}`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        );

        const [routeResponse, photoResponse] = await Promise.all([
          routeRequest,
          photoRequest,
        ]);

        let route: AircraftRoute | null = null;
        let photo: AircraftPhoto | null = null;

        if (routeResponse?.ok) {
          const payload = (await routeResponse.json()) as {
            route?: AircraftRoute | null;
          };
          route = payload.route ?? null;
        }

        if (photoResponse.ok) {
          const payload = (await photoResponse.json()) as {
            photo?: AircraftPhoto | null;
          };
          photo = payload.photo ?? null;
        }

        if (active) setMetadata(aircraftMetadata(route, photo));
      } catch (caught) {
        if (controller.signal.aborted || !active) return;

        setMetadata({
          loading: false,
          error:
            caught instanceof Error
              ? caught.message
              : 'Additional object details are unavailable',
          rows: [],
        });
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    selection?.kind,
    selection?.id,
    selectedSatellite?.norad,
    selectedSatellite?.name,
    selectedAircraft?.callsign,
    selectedAircraft?.registration,
    selectedAircraft?.type,
    selectedAircraft?.icaoHex,
  ]);

  return metadata;
}
