import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  Text,
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
  type Observer,
} from '@/sky/astronomy';
import { projectAltAz } from '@/sky/projection';
import { useObserverLocation } from '@/location/useObserverLocation';

type Size = {
  width: number;
  height: number;
};

export default function SkyScreen() {
  const [now, setNow] = useState(Date.now());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [yaw, setYaw] = useState(180);
  const [pitch, setPitch] = useState(28);
  const gestureStart = useRef({ yaw: 180, pitch: 28 });
  const {
    observer,
    source,
    requesting,
    error: locationError,
    useCurrentLocation,
    useDemoLocation,
  } = useObserverLocation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
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
    [pitch, yaw],
  );

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
              Live Sky · M1
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
                {requesting
                  ? 'Finding location…'
                  : source === 'device'
                    ? 'Current location'
                    : 'Demo observer'}
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
                  : 'Tap to use your location'}
              </Text>
            </Pressable>

            {source === 'device' ? (
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
                  Use demo location
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {locationError ? (
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
              {locationError}
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
            Drag to look around
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}
