export type SatelliteGroupKey =
  | 'new'
  | 'stations'
  | 'bright'
  | 'starlink'
  | 'oneweb'
  | 'kuiper'
  | 'navigation'
  | 'weather'
  | 'earth'
  | 'science'
  | 'amateur'
  | 'geo'
  | 'military'
  | 'cubesat'
  | 'debris';

export type SatelliteGroupDefinition = {
  key: SatelliteGroupKey;
  label: string;
  sources: string[];
  color: string;
  defaultEnabled: boolean;
};

export const SATELLITE_GROUPS: SatelliteGroupDefinition[] = [
  { key: 'new', label: 'New launches', sources: ['last-30-days'], color: '#68ff9a', defaultEnabled: true },
  { key: 'stations', label: 'Space stations', sources: ['stations'], color: '#ffffff', defaultEnabled: true },
  { key: 'bright', label: 'Bright / visual', sources: ['visual'], color: '#ffe082', defaultEnabled: true },
  { key: 'starlink', label: 'Starlink', sources: ['starlink'], color: '#64b5f6', defaultEnabled: true },
  { key: 'oneweb', label: 'OneWeb', sources: ['oneweb'], color: '#ab8cff', defaultEnabled: false },
  { key: 'kuiper', label: 'Kuiper', sources: ['kuiper'], color: '#50d0ff', defaultEnabled: false },
  { key: 'navigation', label: 'Navigation / GNSS', sources: ['gnss'], color: '#4dd0c8', defaultEnabled: false },
  { key: 'weather', label: 'Weather', sources: ['weather'], color: '#6ed0ff', defaultEnabled: false },
  { key: 'earth', label: 'Earth observation', sources: ['earth-resources'], color: '#7ee787', defaultEnabled: false },
  { key: 'science', label: 'Science', sources: ['science'], color: '#e6a6ff', defaultEnabled: false },
  { key: 'amateur', label: 'Amateur radio', sources: ['amateur'], color: '#ffb86c', defaultEnabled: false },
  { key: 'geo', label: 'Geostationary', sources: ['geo'], color: '#ffd166', defaultEnabled: false },
  { key: 'military', label: 'Military', sources: ['military'], color: '#ff9f43', defaultEnabled: false },
  { key: 'cubesat', label: 'CubeSats', sources: ['cubesat'], color: '#b7f7d0', defaultEnabled: false },
  {
    key: 'debris',
    label: 'Space junk / debris',
    sources: [
      'fengyun-1c-debris',
      'iridium-33-debris',
      'cosmos-2251-debris',
      'cosmos-1408-debris',
    ],
    color: '#ff6262',
    defaultEnabled: false,
  },
];

export type SatelliteGroupState = Record<SatelliteGroupKey, boolean>;

export function defaultSatelliteGroupState(): SatelliteGroupState {
  return Object.fromEntries(
    SATELLITE_GROUPS.map((group) => [group.key, group.defaultEnabled]),
  ) as SatelliteGroupState;
}

export function activeSatelliteSources(state: SatelliteGroupState) {
  return [
    ...new Set(
      SATELLITE_GROUPS
        .filter((group) => state[group.key])
        .flatMap((group) => group.sources),
    ),
  ];
}

export function satelliteMatchesActiveGroups(
  groups: string[],
  state: SatelliteGroupState,
) {
  const values = new Set(groups);

  return SATELLITE_GROUPS.some(
    (group) =>
      state[group.key] &&
      group.sources.some((source) => values.has(source)),
  );
}
