import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { StarField } from '@/components/StarField';
import { colors } from '@/theme/colors';
import { useObserverLocation } from '@/location/useObserverLocation';
import { currentPlanetPositions } from '@/sky/astronomy';
import {
  eventTitle,
  upcomingHorizonEvents,
  visibleSkyObjects,
  type HorizonEvent,
  type VisibleSkyObject,
} from '@/sky/skyEvents';

function lightState(sunElevation: number) {
  if (sunElevation >= 0) return 'Daylight';
  if (sunElevation >= -6) return 'Civil twilight';
  if (sunElevation >= -12) return 'Nautical twilight';
  if (sunElevation >= -18) return 'Astronomical twilight';
  return 'Night';
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventTimeLabel(time: number, now: number) {
  const eventDate = new Date(time);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const clock = eventDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (sameLocalDay(eventDate, today)) return `Today · ${clock}`;
  if (sameLocalDay(eventDate, tomorrow)) return `Tomorrow · ${clock}`;

  return `${eventDate.toLocaleDateString(undefined, {
    weekday: 'short',
  })} · ${clock}`;
}

function showObjectInSky(object: VisibleSkyObject) {
  router.push({
    pathname: '/sky',
    params: {
      targetKind: object.kind,
      targetId: object.id,
    },
  });
}

function eventDescription(event: HorizonEvent) {
  if (event.objectId === 'sun') {
    return event.type === 'set'
      ? 'Sun crosses below the horizon'
      : 'Sun crosses above the horizon';
  }

  return `${event.type === 'rise' ? 'Rising' : 'Setting'} near azimuth ${Math.round(
    event.azimuth,
  )}°`;
}

export default function TonightScreen() {
  const [now, setNow] = useState(Date.now());
  const {
    observer,
    label: observerLabel,
    restoring,
  } = useObserverLocation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const minuteNow = Math.floor(now / 60_000) * 60_000;

  const planets = useMemo(
    () => currentPlanetPositions(minuteNow, observer),
    [minuteNow, observer],
  );

  const sun = planets.find((planet) => planet.id === 'sun');
  const sunElevation = sun?.el ?? -18;

  const visible = useMemo(
    () => visibleSkyObjects(observer, minuteNow),
    [minuteNow, observer],
  );

  const events = useMemo(
    () => upcomingHorizonEvents(observer, minuteNow),
    [minuteNow, observer],
  );

  return (
    <AppScreen>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StarField />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 28,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: '700',
            }}
          >
            Tonight
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {restoring ? 'Restoring observer…' : observerLabel}
          </Text>

          <View
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 20,
              backgroundColor: 'rgba(9,18,33,0.96)',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.1,
              }}
            >
              SKY NOW
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 6,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 23,
                    fontWeight: '700',
                  }}
                >
                  {lightState(sunElevation)}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    marginTop: 3,
                  }}
                >
                  Sun altitude {sunElevation.toFixed(1)}°
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 22,
                    fontWeight: '700',
                  }}
                >
                  {visible.length}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  bright objects up
                </Text>
              </View>
            </View>
          </View>

          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.1,
              marginTop: 22,
              marginBottom: 8,
            }}
          >
            VISIBLE NOW
          </Text>

          {visible.length ? (
            visible.slice(0, 12).map((object) => (
              <Pressable
                key={`${object.kind}:${object.id}`}
                accessibilityRole="button"
                onPress={() => showObjectInSky(object)}
                style={{
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 13,
                  paddingVertical: 9,
                  marginBottom: 7,
                  borderRadius: 14,
                  backgroundColor: 'rgba(9,18,33,0.9)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: object.kind === 'star' ? 7 : 10,
                    height: object.kind === 'star' ? 7 : 10,
                    borderRadius: object.kind === 'star' ? 3.5 : 5,
                    backgroundColor: object.color,
                    marginRight: 12,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  >
                    {object.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.muted,
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    {object.detail} · alt {object.altitude.toFixed(1)}° · az{' '}
                    {object.azimuth.toFixed(0)}°
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  SKY ›
                </Text>
              </Pressable>
            ))
          ) : (
            <View
              style={{
                padding: 16,
                borderRadius: 14,
                backgroundColor: 'rgba(9,18,33,0.9)',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                No bright catalogue objects above the horizon
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  lineHeight: 17,
                  marginTop: 4,
                }}
              >
                The full sky still contains fainter objects; this summary keeps
                the list focused on brighter targets.
              </Text>
            </View>
          )}

          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.1,
              marginTop: 22,
              marginBottom: 8,
            }}
          >
            NEXT 18 HOURS
          </Text>

          {events.map((event) => (
            <View
              key={event.id}
              style={{
                minHeight: 62,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 13,
                paddingVertical: 9,
                marginBottom: 7,
                borderRadius: 14,
                backgroundColor: 'rgba(9,18,33,0.9)',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 11,
                  backgroundColor: colors.panelSoft,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: event.color,
                    fontSize: 17,
                    fontWeight: '700',
                  }}
                >
                  {event.type === 'rise' ? '↑' : '↓'}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {eventTitle(event)}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  {eventDescription(event)}
                </Text>
              </View>

              <Text
                style={{
                  color: colors.text,
                  fontSize: 11,
                  fontWeight: '700',
                  textAlign: 'right',
                  marginLeft: 10,
                }}
              >
                {eventTimeLabel(event.time, minuteNow)}
              </Text>
            </View>
          ))}

          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              lineHeight: 15,
              marginTop: 10,
            }}
          >
            Rise/set times are calculated locally from the selected observer
            position and use the geometric horizon. Terrain and atmospheric
            refraction corrections will be added with the full horizon model.
          </Text>
        </ScrollView>
      </View>
    </AppScreen>
  );
}
