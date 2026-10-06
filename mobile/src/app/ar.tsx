import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { AppScreen } from '@/components/AppScreen';
import { ArOverlayCanvas } from '@/components/ArOverlayCanvas';
import { colors } from '@/theme/colors';
import { BRIGHT_STARS } from '@/sky/catalog';
import {
  clamp,
  currentPlanetPositions,
  raDecToAltAz,
} from '@/sky/astronomy';
import { projectAltAz } from '@/sky/projection';
import { useObserverLocation } from '@/location/useObserverLocation';
import { useDevicePointing } from '@/orientation/useDevicePointing';

const AR_STARS = BRIGHT_STARS.filter((star) => star.mag <= 4.5);

type Size = {
  width: number;
  height: number;
};

export default function ArScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [now, setNow] = useState(Date.now());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [fov, setFov] = useState(68);

  const {
    observer,
    source,
    label: observerLabel,
    requesting: locationRequesting,
    useCurrentLocation,
  } = useObserverLocation();

  const {
    active: pointingActive,
    starting: pointingStarting,
    heading,
    elevation,
    headingAccuracy,
    usingTrueNorth,
    calibrated,
    error: pointingError,
    start: startPointing,
    stop: stopPointing,
  } = useDevicePointing();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const stars = useMemo(
    () =>
      AR_STARS.map((star) => ({
        ...star,
        ...raDecToAltAz(
          star.ra,
          star.dec,
          now,
          observer,
        ),
      })),
    [now, observer],
  );

  const planets = useMemo(
    () => currentPlanetPositions(now, observer),
    [now, observer],
  );

  const viewport = {
    ...size,
    yaw: heading ?? 180,
    pitch: elevation ?? 20,
    fov,
  };

  const labels = useMemo(() => {
    if (!pointingActive || size.width <= 0 || size.height <= 0) return [];

    const starLabels = stars
      .filter((star) => star.mag <= 1.25 && star.el >= 0)
      .flatMap((star) => {
        const point = projectAltAz(star.az, star.el, viewport);
        return point ? [{
          id: `star-${star.id}`,
          name: star.name,
          x: point.x,
          y: point.y,
          color: star.color,
        }] : [];
      });

    const planetLabels = planets
      .filter((planet) => planet.el >= 0)
      .flatMap((planet) => {
        const point = projectAltAz(planet.az, planet.el, viewport);
        return point ? [{
          id: `planet-${planet.id}`,
          name: planet.name,
          x: point.x,
          y: point.y,
          color: planet.color,
        }] : [];
      });

    return [...starLabels, ...planetLabels];
  }, [planets, pointingActive, size.height, size.width, stars, viewport]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  const cameraGranted = Boolean(permission?.granted);
  const observerReady = source === 'device';
  const aligned =
    cameraGranted &&
    observerReady &&
    pointingActive &&
    heading !== null &&
    elevation !== null;

  return (
    <AppScreen>
      <View
        onLayout={onLayout}
        style={{
          flex: 1,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {cameraGranted ? (
          <CameraView
            facing="back"
            mode="picture"
            mute
            style={{
              position: 'absolute',
              inset: 0,
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 26,
              backgroundColor: colors.background,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              AR Sky
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: 13,
                lineHeight: 20,
                textAlign: 'center',
                marginTop: 10,
                maxWidth: 420,
              }}
            >
              ALEN overlays calculated stars and planets on the live rear-camera
              view. The camera is preview-only; AR Sky does not capture or save
              photos or video.
            </Text>

            {permission ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (permission.canAskAgain) {
                    void requestPermission();
                  } else {
                    void Linking.openSettings();
                  }
                }}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  paddingHorizontal: 22,
                  borderRadius: 14,
                  backgroundColor: colors.accent,
                  marginTop: 20,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {permission.canAskAgain ? 'Enable camera' : 'Open camera settings'}
                </Text>
              </Pressable>
            ) : (
              <Text style={{ color: colors.muted, marginTop: 18 }}>
                Checking camera permission…
              </Text>
            )}
          </View>
        )}

        {cameraGranted ? (
          <>
            {aligned ? (
              <ArOverlayCanvas
                stars={stars}
                planets={planets}
                viewport={viewport}
              />
            ) : null}

            {labels.map((label) => (
              <View
                key={label.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: label.x - 45,
                  top: label.y + 8,
                  width: 90,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: '700',
                    textAlign: 'center',
                    textShadowColor: '#000',
                    textShadowRadius: 4,
                  }}
                >
                  {label.name}
                </Text>
              </View>
            ))}

            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 26,
                height: 26,
                marginLeft: -13,
                marginTop: -13,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: 12,
                  top: 0,
                  width: 2,
                  height: 26,
                  backgroundColor: 'rgba(255,255,255,0.75)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 12,
                  width: 26,
                  height: 2,
                  backgroundColor: 'rgba(255,255,255,0.75)',
                }}
              />
            </View>

            <View
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                right: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <View
                style={{
                  maxWidth: '62%',
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 14,
                  backgroundColor: 'rgba(2,7,17,0.82)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                  AR Sky · baseline
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 9,
                    lineHeight: 13,
                    marginTop: 2,
                  }}
                >
                  {observerReady
                    ? observerLabel
                    : 'Current physical location required for camera alignment'}
                </Text>
              </View>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 14,
                  backgroundColor: 'rgba(2,7,17,0.82)',
                  borderWidth: 1,
                  borderColor: aligned ? colors.success : colors.border,
                }}
              >
                <Text
                  style={{
                    color: aligned ? colors.success : colors.muted,
                    fontSize: 10,
                    fontWeight: '700',
                  }}
                >
                  {aligned ? 'ALIGNED' : 'NOT ALIGNED'}
                </Text>
              </View>
            </View>

            {!observerReady ? (
              <View
                style={{
                  position: 'absolute',
                  left: 18,
                  right: 18,
                  bottom: 92,
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: 'rgba(2,7,17,0.94)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                  Use your current location
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    lineHeight: 16,
                    marginTop: 5,
                  }}
                >
                  Camera AR represents the sky where the phone physically is, so
                  manual or remote observer locations are not used in this mode.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={locationRequesting}
                  onPress={() => void useCurrentLocation()}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                    marginTop: 12,
                    opacity: locationRequesting ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {locationRequesting ? 'Finding location…' : 'Use current location'}
                  </Text>
                </Pressable>
              </View>
            ) : !pointingActive ? (
              <View
                style={{
                  position: 'absolute',
                  left: 18,
                  right: 18,
                  bottom: 92,
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: 'rgba(2,7,17,0.94)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                  Align camera with the sky
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    lineHeight: 16,
                    marginTop: 5,
                  }}
                >
                  Motion and compass data stay on this device and are used only
                  while AR alignment is active.
                </Text>
                {pointingError ? (
                  <Text
                    style={{
                      color: colors.warning,
                      fontSize: 10,
                      lineHeight: 15,
                      marginTop: 8,
                    }}
                  >
                    {pointingError}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={pointingStarting}
                  onPress={() => void startPointing()}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                    marginTop: 12,
                    opacity: pointingStarting ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {pointingStarting ? 'Starting alignment…' : 'Start AR alignment'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View
                  style={{
                    position: 'absolute',
                    left: 18,
                    bottom: 18,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 14,
                    backgroundColor: 'rgba(2,7,17,0.84)',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 10, fontWeight: '700' }}>
                    {Math.round(heading ?? 0)}° · {Math.round(elevation ?? 0)}° up
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>
                    {usingTrueNorth ? 'True north' : 'Magnetic north'}
                    {headingAccuracy !== null ? ` · accuracy ${headingAccuracy}` : ''}
                    {calibrated ? ' · calibrated' : ''}
                  </Text>
                </View>

                <View
                  style={{
                    position: 'absolute',
                    right: 18,
                    bottom: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    padding: 6,
                    borderRadius: 14,
                    backgroundColor: 'rgba(2,7,17,0.84)',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease AR field of view"
                    onPress={() => setFov((value) => clamp(value - 3, 45, 100))}
                    style={{
                      width: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 10,
                      backgroundColor: colors.panelSoft,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text
                    style={{
                      width: 50,
                      color: colors.text,
                      fontSize: 10,
                      textAlign: 'center',
                      fontWeight: '700',
                    }}
                  >
                    {Math.round(fov)}° FOV
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase AR field of view"
                    onPress={() => setFov((value) => clamp(value + 3, 45, 100))}
                    style={{
                      width: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 10,
                      backgroundColor: colors.panelSoft,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={stopPointing}
                  style={{
                    position: 'absolute',
                    right: 18,
                    top: 78,
                    minHeight: 38,
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: 'rgba(2,7,17,0.82)',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 10, fontWeight: '700' }}>
                    Pause alignment
                  </Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}
      </View>
    </AppScreen>
  );
}
