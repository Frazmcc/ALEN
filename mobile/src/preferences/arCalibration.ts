import AsyncStorage from '@react-native-async-storage/async-storage';
import { AR_CALIBRATION_STORAGE_KEY } from '@/storage/keys';

export type ArLensProfileId = 'wide' | 'standard' | 'telephoto';

export type ArLensProfile = {
  id: ArLensProfileId;
  label: string;
  defaultFov: number;
};

export const AR_LENS_PROFILES: ArLensProfile[] = [
  { id: 'wide', label: 'Wide', defaultFov: 96 },
  { id: 'standard', label: 'Standard', defaultFov: 68 },
  { id: 'telephoto', label: 'Tele', defaultFov: 45 },
];

export type ArCalibrationPreference = {
  profileId: ArLensProfileId;
  fov: number;
};

export function defaultArCalibration(): ArCalibrationPreference {
  return {
    profileId: 'standard',
    fov: 68,
  };
}

export function lensProfile(profileId: ArLensProfileId) {
  return (
    AR_LENS_PROFILES.find((profile) => profile.id === profileId) ??
    AR_LENS_PROFILES[1]
  );
}

export function nextLensProfile(profileId: ArLensProfileId) {
  const index = AR_LENS_PROFILES.findIndex((profile) => profile.id === profileId);
  return AR_LENS_PROFILES[(Math.max(index, 0) + 1) % AR_LENS_PROFILES.length];
}

function isProfileId(value: unknown): value is ArLensProfileId {
  return value === 'wide' || value === 'standard' || value === 'telephoto';
}

export async function loadArCalibration(): Promise<ArCalibrationPreference> {
  const fallback = defaultArCalibration();

  try {
    const raw = await AsyncStorage.getItem(AR_CALIBRATION_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const profileId = isProfileId(parsed.profileId)
      ? parsed.profileId
      : fallback.profileId;
    const profile = lensProfile(profileId);
    const rawFov = typeof parsed.fov === 'number' ? parsed.fov : profile.defaultFov;

    return {
      profileId,
      fov: Math.min(100, Math.max(45, rawFov)),
    };
  } catch {
    return fallback;
  }
}

export async function saveArCalibration(
  preference: ArCalibrationPreference,
) {
  try {
    await AsyncStorage.setItem(
      AR_CALIBRATION_STORAGE_KEY,
      JSON.stringify(preference),
    );
  } catch {
    // AR calibration persistence must never prevent camera sky use.
  }
}

export async function clearArCalibration() {
  try {
    await AsyncStorage.removeItem(AR_CALIBRATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
