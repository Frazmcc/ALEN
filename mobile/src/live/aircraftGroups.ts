import type { AircraftTrack } from '@/live/aircraftMotion';

export type AircraftGroupKey =
  | 'commercial'
  | 'military'
  | 'emergency'
  | 'other';

export type AircraftGroupState = Record<AircraftGroupKey, boolean>;

export const AIRCRAFT_GROUPS: Array<{
  key: AircraftGroupKey;
  label: string;
  defaultEnabled: boolean;
  color: string;
}> = [
  { key: 'commercial', label: 'Commercial', defaultEnabled: true, color: '#64d8ff' },
  { key: 'military', label: 'Military', defaultEnabled: true, color: '#ff9f43' },
  { key: 'emergency', label: 'Emergency / special', defaultEnabled: true, color: '#ff6262' },
  { key: 'other', label: 'Other', defaultEnabled: true, color: '#d9e8ff' },
];

const AIRLINE_PREFIXES = new Set([
  'BAW',
  'SHT',
  'EZY',
  'TOM',
  'KLM',
  'RYR',
  'LOG',
  'EXS',
  'DLH',
  'EIN',
  'AFR',
  'VIR',
  'UAE',
  'QTR',
  'THY',
  'SAS',
  'NAX',
  'WUK',
  'WZZ',
  'UAL',
  'DAL',
  'AAL',
]);

const SPECIAL_SQUAWKS = new Set([
  '0020',
  '0023',
  '0026',
  '0032',
  '0033',
  '0034',
  '7500',
  '7600',
  '7700',
]);

export function defaultAircraftGroupState(): AircraftGroupState {
  return Object.fromEntries(
    AIRCRAFT_GROUPS.map((group) => [group.key, group.defaultEnabled]),
  ) as AircraftGroupState;
}

function isMilitary(track: AircraftTrack) {
  const operator = track.operator.toUpperCase();
  const callsign = (track.callsign || track.name).toUpperCase();

  return (
    Boolean(track.dbFlags & 1) ||
    /(ROYAL AIR FORCE|RAF|ROYAL NAVY|ARMY AIR|MILITARY)/.test(operator) ||
    /^(RFR|RRR|NVY|AAC)/.test(callsign)
  );
}

function isEmergency(track: AircraftTrack) {
  const squawk = track.squawk.padStart(4, '0');
  const callsign = (track.callsign || track.name).toUpperCase();
  const operator = track.operator.toUpperCase();

  return (
    SPECIAL_SQUAWKS.has(squawk) ||
    /^(UKP|POLICE|HLE|HELIMED|COASTGUARD|RESCUE|BRITISH RESCUE)/.test(callsign) ||
    /(POLICE|AIR AMBULANCE|COASTGUARD)/.test(operator)
  );
}

export function aircraftGroupKey(track: AircraftTrack): AircraftGroupKey {
  if (isMilitary(track)) return 'military';
  if (isEmergency(track)) return 'emergency';

  const callsign = (track.callsign || track.name).trim().toUpperCase();
  const prefix = callsign.match(/^[A-Z]{3}/)?.[0];

  if (prefix && AIRLINE_PREFIXES.has(prefix)) return 'commercial';
  return 'other';
}

export function aircraftMatchesActiveGroup(
  track: AircraftTrack,
  state: AircraftGroupState,
) {
  return state[aircraftGroupKey(track)];
}
