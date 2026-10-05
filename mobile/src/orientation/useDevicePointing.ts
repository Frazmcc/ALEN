import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { clamp, norm360 } from '@/sky/astronomy';

const RAD_TO_DEG = 180 / Math.PI;
const SENSOR_INTERVAL_MS = 33;

type PointingStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error';

function smoothAngle(previous: number | null, next: number, amount: number) {
  if (previous === null) return norm360(next);
  const delta = ((next - previous + 540) % 360) - 180;
  return norm360(previous + delta * amount);
}

function smoothLinear(previous: number | null, next: number, amount: number) {
  if (previous === null) return next;
  return previous + (next - previous) * amount;
}

function cameraElevationFromGravity(
  gravity: { x: number; y: number; z: number },
) {
  const magnitude = Math.hypot(gravity.x, gravity.y, gravity.z);
  if (!Number.isFinite(magnitude) || magnitude < 0.001) return null;

  // Expo defines +Z as running through the screen from back to front.
  // ALEN observes through the rear camera direction, so its forward axis is -Z.
  const upComponent = clamp(-gravity.z / magnitude, -1, 1);
  return Math.asin(upComponent) * RAD_TO_DEG;
}

export function useDevicePointing() {
  const [status, setStatus] = useState<PointingStatus>('idle');
  const [heading, setHeading] = useState<number | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [usingTrueNorth, setUsingTrueNorth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const motionSubscription = useRef<ReturnType<
    typeof DeviceMotion.addListener
  > | null>(null);
  const headingSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );
  const smoothedHeading = useRef<number | null>(null);
  const smoothedElevation = useRef<number | null>(null);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    motionSubscription.current?.remove();
    motionSubscription.current = null;
    headingSubscription.current?.remove();
    headingSubscription.current = null;
    smoothedHeading.current = null;
    smoothedElevation.current = null;
    setStatus('idle');
    setHeading(null);
    setElevation(null);
    setHeadingAccuracy(null);
    setUsingTrueNorth(false);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    if (status === 'starting' || status === 'active') return;

    const startGeneration = generation.current + 1;
    generation.current = startGeneration;
    setStatus('starting');
    setError(null);

    try {
      const locationPermission =
        await Location.getForegroundPermissionsAsync();

      if (!locationPermission.granted) {
        setStatus('denied');
        setError(
          'Use current location first so ALEN can align the sky to your position and true north.',
        );
        return;
      }

      const available = await DeviceMotion.isAvailableAsync();
      if (!available) {
        setStatus('unavailable');
        setError('Motion sensors are not available on this device.');
        return;
      }

      const motionPermission = await DeviceMotion.requestPermissionsAsync();
      if (!motionPermission.granted) {
        setStatus('denied');
        setError(
          'Motion access was not granted. Manual drag mode is still available.',
        );
        return;
      }

      if (generation.current !== startGeneration) return;

      DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);

      motionSubscription.current = DeviceMotion.addListener((measurement) => {
        const gravity = measurement.accelerationIncludingGravity;
        const nextElevation = cameraElevationFromGravity(gravity);
        if (nextElevation === null) return;

        smoothedElevation.current = smoothLinear(
          smoothedElevation.current,
          nextElevation,
          0.28,
        );
        setElevation(smoothedElevation.current);
      });

      headingSubscription.current = await Location.watchHeadingAsync(
        (measurement) => {
          const trueNorthAvailable =
            Number.isFinite(measurement.trueHeading) &&
            measurement.trueHeading >= 0;
          const nextHeading = trueNorthAvailable
            ? measurement.trueHeading
            : measurement.magHeading;

          if (!Number.isFinite(nextHeading)) return;

          smoothedHeading.current = smoothAngle(
            smoothedHeading.current,
            nextHeading,
            0.22,
          );
          setHeading(smoothedHeading.current);
          setHeadingAccuracy(measurement.accuracy);
          setUsingTrueNorth(trueNorthAvailable);
        },
        (message) => {
          setError(`Compass error: ${message}`);
        },
      );

      if (generation.current !== startGeneration) {
        motionSubscription.current?.remove();
        motionSubscription.current = null;
        headingSubscription.current?.remove();
        headingSubscription.current = null;
        return;
      }

      setStatus('active');
    } catch {
      if (generation.current !== startGeneration) return;

      motionSubscription.current?.remove();
      motionSubscription.current = null;
      headingSubscription.current?.remove();
      headingSubscription.current = null;
      setStatus('error');
      setError(
        'ALEN could not start phone aiming. Manual drag mode is still available.',
      );
    }
  }, [status]);

  useEffect(() => stop, [stop]);

  return {
    active: status === 'active',
    starting: status === 'starting',
    status,
    heading,
    elevation,
    headingAccuracy,
    usingTrueNorth,
    error,
    start,
    stop,
  };
}
