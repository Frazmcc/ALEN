import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SkyLayers } from '@/components/SkyLayersControl';
import {
  defaultSatelliteGroupState,
  type SatelliteGroupState,
} from '@/live/satelliteGroups';
import {
  defaultAircraftGroupState,
  type AircraftGroupState,
} from '@/live/aircraftGroups';
import { SKY_PREFERENCES_SKY_PREFERENCES_STORAGE_KEY } from '@/storage/keys';

export type PersistedSkyPreferences = {
  stars: boolean;
  constellations: boolean;
  planets: boolean;
  atmosphere: boolean;
  landscape: boolean;
  satelliteGroups: SatelliteGroupState;
  aircraftGroups: AircraftGroupState;
};

export function defaultSkyPreferences(): PersistedSkyPreferences {
  return {
    stars: true,
    constellations: true,
    planets: true,
    atmosphere: true,
    landscape: true,
    satelliteGroups: defaultSatelliteGroupState(),
    aircraftGroups: defaultAircraftGroupState(),
  };
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function mergeBooleanRecord<T extends Record<string, boolean>>(
  value: unknown,
  fallback: T,
): T {
  if (!value || typeof value !== 'object') return fallback;

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, defaultValue]) => [
      key,
      bool(source[key], defaultValue),
    ]),
  ) as T;
}

export async function loadSkyPreferences() {
  const defaults = defaultSkyPreferences();

  try {
    const raw = await AsyncStorage.getItem(SKY_PREFERENCES_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      stars: bool(parsed.stars, defaults.stars),
      constellations: bool(
        parsed.constellations,
        defaults.constellations,
      ),
      planets: bool(parsed.planets, defaults.planets),
      atmosphere: bool(parsed.atmosphere, defaults.atmosphere),
      landscape: bool(parsed.landscape, defaults.landscape),
      satelliteGroups: mergeBooleanRecord(
        parsed.satelliteGroups,
        defaults.satelliteGroups,
      ),
      aircraftGroups: mergeBooleanRecord(
        parsed.aircraftGroups,
        defaults.aircraftGroups,
      ),
    } satisfies PersistedSkyPreferences;
  } catch {
    return defaults;
  }
}

export async function saveSkyPreferences(input: {
  layers: SkyLayers;
  satelliteGroups: SatelliteGroupState;
  aircraftGroups: AircraftGroupState;
}) {
  const payload: PersistedSkyPreferences = {
    stars: input.layers.stars,
    constellations: input.layers.constellations,
    planets: input.layers.planets,
    atmosphere: input.layers.atmosphere,
    landscape: input.layers.landscape,
    satelliteGroups: input.satelliteGroups,
    aircraftGroups: input.aircraftGroups,
  };

  try {
    await AsyncStorage.setItem(SKY_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Preference persistence must never break the live sky.
  }
}

export async function clearSkyPreferences() {
  try {
    await AsyncStorage.removeItem(SKY_PREFERENCES_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
