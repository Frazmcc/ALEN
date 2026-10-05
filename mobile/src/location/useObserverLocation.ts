import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { Observer } from '@/sky/astronomy';

export const DEMO_OBSERVER: Observer = {
  lat: 51.4769,
  lon: 0,
};

export type ObserverSource = 'demo' | 'device';

export function useObserverLocation() {
  const [observer, setObserver] = useState<Observer>(DEMO_OBSERVER);
  const [source, setSource] = useState<ObserverSource>('demo');
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useCurrentLocation = useCallback(async () => {
    if (requesting) return;

    setRequesting(true);
    setError(null);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setError('Location services are switched off on this device.');
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError(
          'Location permission was not granted. ALEN will keep using the demo location.',
        );
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setObserver({
        lat: result.coords.latitude,
        lon: result.coords.longitude,
      });
      setSource('device');
    } catch {
      setError(
        'ALEN could not read your current location. The demo location is still available.',
      );
    } finally {
      setRequesting(false);
    }
  }, [requesting]);

  const useDemoLocation = useCallback(() => {
    setObserver(DEMO_OBSERVER);
    setSource('demo');
    setError(null);
  }, []);

  return {
    observer,
    source,
    requesting,
    error,
    useCurrentLocation,
    useDemoLocation,
  };
}
