import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { colors } from '@/theme/colors';
import { BRIGHT_STARS } from '@/sky/catalog';
import {
  clamp,
  currentPlanetPositions,
  norm360,
  raDecToAltAz,
  skyPalette,
} from '@/sky/astronomy';
import { projectAltAz } from '@/sky/projection';
import { useObserverLocation } from '@/location/useObserverLocation';
import { useDevicePointing } from '@/orientation/useDevicePointing';

type Size = {
  width: number;
  height: number;
};

export default function SkyScreen() {
  const [now, setNow] = useState(Date.now());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [yaw, setYaw] = useState(180);
  const [pitch, setPitch] = useState(28);
  const [manualLocationOpen, setManualLocationOpen] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const gestureStart = useRef({ yaw: 180, pitch: 28 });
  const {
    observer,
    source,
    label: observerLabel,
    requesting,
    restoring,
    error: locationError,
    useCurrentLocation,
    useManualLocation,
    useDemoLocation,
  } = useObserverLocation();
  const {
    active: phoneAimActive,
    starting: phoneAimStarting,
    heading: phoneHeading,
    elevation: phoneElevation,
    headingAccuracy,
    usingTrueNorth,
    error: phoneAimError,
    start: startPhoneAim,
    stop: stopPhoneAim,
  } = useDevicePointing();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!phoneAimActive) return;
    if (phoneHeading !== null) setYaw(phoneHeading);
    if (phoneElevation !== null) {
      setPitch(clamp(phoneElevation, 0, 84));
    }
  }, [phoneAimActive, phoneElevation, phoneHeading]);

  useEffect(() => {
    if (source !== 'device' && phoneAimActive) {
      stopPhoneAim();
    }
  }, [phoneAimActive, source, stopPhoneAim]);

  const planets = useMemo(
    () => currentPlanetPositions(now, observer),
    [now, observer],
  );

  const sun = planets.find((planet) => planet.id === 'sun');
  const palette = skyPalette(sun?.el ?? -18);

  const stars = useMemo(
    () =>
      BRIGHT_STARS.map((star) => ({
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

  const viewport = {
    ...size,
    yaw,
    pitch,
    fov: 105,
  };

  const horizon = projectAltAz(yaw, 0, viewport);
  const horizonY = clamp(
    horizon?.y ?? size.height * 0.78,
    0,
    size.height,
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !phoneAimActive &&
          (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
        onPanResponderGrant: () => {
          gestureStart.current = { yaw, pitch };
        },
        onPanResponderMove: (_, gesture) => {
          setYaw(
            norm360(gestureStart.current.yaw - gesture.dx * 0.22),
          );
          setPitch(
            clamp(
              gestureStart.current.pitch + gesture.dy * 0.12,
              0,
              84,
            ),
          );
        },
      }),
    [phoneAimActive, pitch, yaw],
  );

  function openManualLocation() {
    setManualLabel(source === 'manual' ? observerLabel : '');
    setManualLat(observer.lat.toFixed(6));
    setManualLon(observer.lon.toFixed(6));
    setManualError(null);
    setManualLocationOpen(true);
  }

  async function saveManualLocation() {
    const lat = Number(manualLat.trim().replace(',', '.'));
    const lon = Number(manualLon.trim().replace(',', '.'));

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      setManualError(
        'Latitude must be between -90 and 90 and longitude between -180 and 180.',
      );
      return;
    }

    const saved = await useManualLocation(lat, lon, manualLabel);
    if (saved) {
      setManualError(null);
      setManualLocationOpen(false);
    }
  }

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  return (
    <AppScreen>
      <View
        onLayout={onLayout}
        {...panResponder.panHandlers}
        style={{ flex: 1, overflow: 'hidden', backgroundColor: palette.top }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '33%',
            bottom: '25%',
            backgroundColor: palette.middle,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '62%',
            bottom: Math.max(0, size.height - horizonY),
            backgroundColor: palette.horizon,
          }}
        />

        {stars
          .filter((star) => star.el >= 0)
          .map((star) => {
            const point = projectAltAz(star.az, star.el, viewport);
            if (!point || palette.stars <= 0.02) return null;

            const dotSize = clamp(4.5 - star.mag, 1.5, 5.5);
            const showLabel = star.mag <= 0.15;

            return (
              <View
                key={star.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: point.x - 28,
                  top: point.y - 8,
                  width: 70,
                  alignItems: 'center',
                  opacity: clamp(palette.stars, 0, 1),
                }}
              >
                <View
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: star.color,
                  }}
                />
                {showLabel ? (
                  <Text
                    style={{
                      marginTop: 4,
                      color: '#eef6ff',
                      fontSize: 10,
                      textShadowColor: '#000',
                      textShadowRadius: 3,
                    }}
                  >
                    {star.name}
                  </Text>
                ) : null}
              </View>
            );
          })}

        {planets
          .filter((planet) => planet.el >= 0)
          .map((planet) => {
            const point = projectAltAz(
              planet.az,
              planet.el,
              viewport,
            );
            if (!point) return null;

            const isSun = planet.id === 'sun';

            return (
              <View
                key={planet.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: point.x - 42,
                  top: point.y - 12,
                  width: 84,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: isSun ? 14 : 9,
                    height: isSun ? 14 : 9,
                    borderRadius: isSun ? 7 : 4.5,
                    backgroundColor: planet.color,
                  }}
                />
                <Text
                  style={{
                    marginTop: 4,
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: '600',
                    textShadowColor: '#000000',
                    textShadowRadius: 4,
                  }}
                >
                  {planet.name}
                </Text>
              </View>
            );
          })}

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: horizonY,
            bottom: 0,
            backgroundColor: '#03080b',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: Math.max(0, horizonY - 1),
            height: 2,
            backgroundColor: palette.horizon,
            opacity: 0.7,
          }}
        />

        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(9,18,33,0.86)',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              Live Sky · M2
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {new Date(now).toLocaleTimeString()}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                source === 'device'
                  ? 'Using current location'
                  : 'Use current location'
              }
              disabled={requesting}
              onPress={useCurrentLocation}
              style={{
                alignItems: 'flex-end',
                backgroundColor: 'rgba(9,18,33,0.92)',
                borderWidth: 1,
                borderColor:
                  source === 'device' ? colors.success : colors.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: requesting ? 0.7 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {restoring
                  ? 'Restoring location…'
                  : requesting
                    ? 'Finding location…'
                    : observerLabel}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {source === 'device'
                  ? 'Foreground location only'
                  : source === 'manual'
                    ? 'Saved on this device'
                    : 'Tap to use your location'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={openManualLocation}
              style={{
                minHeight: 32,
                justifyContent: 'center',
                paddingHorizontal: 10,
                borderRadius: 12,
                backgroundColor: 'rgba(9,18,33,0.88)',
                borderWidth: 1,
                borderColor:
                  source === 'manual' ? colors.accent : colors.border,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                Set manual location
              </Text>
            </Pressable>

            {source !== 'demo' ? (
              <Pressable
                accessibilityRole="button"
                onPress={useDemoLocation}
                style={{
                  minHeight: 32,
                  justifyContent: 'center',
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: 'rgba(9,18,33,0.88)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  Use Greenwich demo
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {locationError || phoneAimError ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 78,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: 'rgba(35,18,18,0.94)',
              borderWidth: 1,
              borderColor: colors.warning,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 11, lineHeight: 16 }}>
              {locationError ?? phoneAimError}
            </Text>
          </View>
        ) : null}

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 18,
            bottom: 18,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: 'rgba(9,18,33,0.9)',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
            {Math.round(yaw)}° · {Math.round(pitch)}° elevation
          </Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
            {phoneAimActive
              ? `${usingTrueNorth ? 'True' : 'Magnetic'} north · compass accuracy ${headingAccuracy ?? '—'}`
              : 'Drag to look around'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            phoneAimActive ? 'Turn off Aim with phone' : 'Turn on Aim with phone'
          }
          disabled={phoneAimStarting}
          onPress={phoneAimActive ? stopPhoneAim : startPhoneAim}
          style={{
            position: 'absolute',
            right: 18,
            bottom: 18,
            minHeight: 44,
            minWidth: 118,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderRadius: 14,
            backgroundColor: phoneAimActive
              ? 'rgba(24,72,52,0.94)'
              : 'rgba(9,18,33,0.94)',
            borderWidth: 1,
            borderColor: phoneAimActive ? colors.success : colors.border,
            opacity: phoneAimStarting ? 0.7 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
            {phoneAimStarting
              ? 'Starting…'
              : phoneAimActive
                ? 'Phone aim ON'
                : 'Aim with phone'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>
            {phoneAimActive ? 'Tap for manual view' : 'Compass + motion'}
          </Text>
        </Pressable>
        <Modal
          visible={manualLocationOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setManualLocationOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: 24,
              backgroundColor: 'rgba(0,0,0,0.72)',
            }}
          >
            <View
              style={{
                borderRadius: 22,
                padding: 20,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: '700',
                }}
              >
                Manual observer location
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 13,
                  lineHeight: 19,
                  marginTop: 6,
                  marginBottom: 18,
                }}
              >
                Enter coordinates for anywhere on Earth. ALEN stores this choice
                only on this device and calculates the sky for that location.
              </Text>

              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
                Name (optional)
              </Text>
              <TextInput
                value={manualLabel}
                onChangeText={setManualLabel}
                placeholder="e.g. Mauna Kea"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.text,
                  paddingHorizontal: 12,
                  marginBottom: 12,
                }}
              />

              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
                Latitude
              </Text>
              <TextInput
                value={manualLat}
                onChangeText={setManualLat}
                placeholder="51.5074"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.text,
                  paddingHorizontal: 12,
                  marginBottom: 12,
                }}
              />

              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
                Longitude
              </Text>
              <TextInput
                value={manualLon}
                onChangeText={setManualLon}
                placeholder="-0.1278"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.text,
                  paddingHorizontal: 12,
                }}
              />

              {manualError ? (
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 11,
                    lineHeight: 16,
                    marginTop: 10,
                  }}
                >
                  {manualError}
                </Text>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  justifyContent: 'flex-end',
                  marginTop: 18,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setManualLocationOpen(false)}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={saveManualLocation}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 18,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    Use location
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </AppScreen>
  );
}
