import {
  createContext,
  createElement,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { Observer } from '@/sky/astronomy';
import { OBSERVER_OBSERVER_STORAGE_KEY } from '@/storage/keys';

export const DEMO_OBSERVER: Observer = {
  lat: 51.4769,
  lon: 0,
};

export type ObserverSource = 'demo' | 'device' | 'manual';

type StoredPreference =
  | { source: 'demo' }
  | { source: 'device' }
  | {
      source: 'manual';
      lat: number;
      lon: number;
      label: string;
    };

function validLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

async function savePreference(preference: StoredPreference) {
  await AsyncStorage.setItem(OBSERVER_STORAGE_KEY, JSON.stringify(preference));
}

function useObserverState() {
  const [observer, setObserver] = useState<Observer>(DEMO_OBSERVER);
  const [source, setSource] = useState<ObserverSource>('demo');
  const [label, setLabel] = useState('Greenwich demo');
  const [requesting, setRequesting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userChangedSelection = useRef(false);
  const requestingRef = useRef(false);

  const applyCurrentLocation = useCallback(
    async ({
      requestPermission,
      persist,
    }: {
      requestPermission: boolean;
      persist: boolean;
    }) => {
      if (requestingRef.current) return false;

      requestingRef.current = true;
      setRequesting(true);
      setError(null);

      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          setError('Location services are switched off on this device.');
          return false;
        }

        const permission = requestPermission
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();

        if (!permission.granted) {
          if (requestPermission) {
            setError(
              'Location permission was not granted. ALEN will keep using the selected manual or demo location.',
            );
          }
          return false;
        }

        const result = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (userChangedSelection.current && !requestPermission) {
          return false;
        }

        setObserver({
          lat: result.coords.latitude,
          lon: result.coords.longitude,
        });
        setSource('device');
        setLabel('Current location');

        if (persist) {
          await savePreference({ source: 'device' });
        }

        return true;
      } catch {
        if (requestPermission) {
          setError(
            'ALEN could not read your current location. A manual or demo location is still available.',
          );
        }
        return false;
      } finally {
        requestingRef.current = false;
        setRequesting(false);
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;

    async function restore() {
      try {
        const raw = await AsyncStorage.getItem(OBSERVER_STORAGE_KEY);
        if (!alive || userChangedSelection.current || !raw) return;

        const preference = JSON.parse(raw) as StoredPreference;

        if (
          preference.source === 'manual' &&
          validLatitude(preference.lat) &&
          validLongitude(preference.lon)
        ) {
          setObserver({ lat: preference.lat, lon: preference.lon });
          setSource('manual');
          setLabel(preference.label || 'Manual location');
          return;
        }

        if (preference.source === 'device') {
          await applyCurrentLocation({
            requestPermission: false,
            persist: false,
          });
          return;
        }

        setObserver(DEMO_OBSERVER);
        setSource('demo');
        setLabel('Greenwich demo');
      } catch {
        // Corrupt or unavailable preference storage should never block the sky.
        setObserver(DEMO_OBSERVER);
        setSource('demo');
        setLabel('Greenwich demo');
      } finally {
        if (alive) setRestoring(false);
      }
    }

    void restore();

    return () => {
      alive = false;
    };
  }, [applyCurrentLocation]);

  const useCurrentLocation = useCallback(async () => {
    userChangedSelection.current = true;
    return applyCurrentLocation({
      requestPermission: true,
      persist: true,
    });
  }, [applyCurrentLocation]);

  const useManualLocation = useCallback(
    async (lat: number, lon: number, manualLabel?: string) => {
      if (!validLatitude(lat) || !validLongitude(lon)) {
        setError(
          'Manual coordinates are invalid. Latitude must be -90 to 90 and longitude -180 to 180.',
        );
        return false;
      }

      userChangedSelection.current = true;
      const nextLabel =
        manualLabel?.trim() ||
        `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      setObserver({ lat, lon });
      setSource('manual');
      setLabel(nextLabel);
      setError(null);

      try {
        await savePreference({
          source: 'manual',
          lat,
          lon,
          label: nextLabel,
        });
      } catch {
        setError(
          'The manual location is active, but ALEN could not save it for the next launch.',
        );
      }

      return true;
    },
    [],
  );

  const useDemoLocation = useCallback(async () => {
    userChangedSelection.current = true;
    setObserver(DEMO_OBSERVER);
    setSource('demo');
    setLabel('Greenwich demo');
    setError(null);

    try {
      await savePreference({ source: 'demo' });
    } catch {
      setError(
        'The demo location is active, but ALEN could not save that preference.',
      );
    }
  }, []);

  const clearSavedObserver = useCallback(async () => {
    userChangedSelection.current = true;
    setObserver(DEMO_OBSERVER);
    setSource('demo');
    setLabel('Greenwich demo');
    setError(null);

    try {
      await AsyncStorage.removeItem(OBSERVER_STORAGE_KEY);
      return true;
    } catch {
      setError(
        'ALEN switched to the demo observer, but could not clear the saved observer preference.',
      );
      return false;
    }
  }, []);

  return {
    observer,
    source,
    label,
    requesting,
    restoring,
    error,
    useCurrentLocation,
    useManualLocation,
    useDemoLocation,
    clearSavedObserver,
  };
}

type ObserverContextValue = ReturnType<typeof useObserverState>;

const ObserverContext = createContext<ObserverContextValue | null>(null);

export function ObserverProvider({ children }: PropsWithChildren) {
  const value = useObserverState();

  return createElement(
    ObserverContext.Provider,
    { value },
    children,
  );
}

export function useObserverLocation() {
  const value = useContext(ObserverContext);

  if (!value) {
    throw new Error(
      'useObserverLocation must be used within ObserverProvider.',
    );
  }

  return value;
}
