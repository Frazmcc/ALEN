import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { StarField } from '@/components/StarField';
import { colors } from '@/theme/colors';
import {
  BRIGHT_STARS,
  PLANET_INFO,
  type PlanetId,
  type Star,
} from '@/sky/catalog';
import {
  currentPlanetPositions,
  raDecToAltAz,
} from '@/sky/astronomy';
import { useObserverLocation } from '@/location/useObserverLocation';

type StarResult = {
  kind: 'star';
  star: Star;
};

type PlanetResult = {
  kind: 'planet';
  id: PlanetId;
};

type SearchResult = StarResult | PlanetResult;
type ObjectCategory = 'all' | 'stars' | 'solar';

const planetIds = Object.keys(PLANET_INFO) as PlanetId[];

const categories: Array<{ key: ObjectCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'stars', label: 'Stars' },
  { key: 'solar', label: 'Solar System' },
];

function resultKey(result: SearchResult) {
  return result.kind === 'star'
    ? `star:${result.star.id}`
    : `planet:${result.id}`;
}

function resultName(result: SearchResult) {
  return result.kind === 'star'
    ? result.star.name
    : PLANET_INFO[result.id].name;
}

export default function ObjectsScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ObjectCategory>('all');
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [brightStarsOnly, setBrightStarsOnly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const { observer, label: observerLabel } = useObserverLocation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const planets = useMemo(
    () => currentPlanetPositions(now, observer),
    [now, observer],
  );

  const results = useMemo<SearchResult[]>(() => {
    const normalized = query.trim().toLowerCase();

    const planetById = new Map(planets.map((planet) => [planet.id, planet]));

    const matchingPlanets =
      category === 'stars'
        ? []
        : planetIds
            .filter((id) => {
              const nameMatches =
                !normalized ||
                PLANET_INFO[id].name.toLowerCase().includes(normalized);
              if (!nameMatches) return false;

              if (!visibleOnly) return true;
              return (planetById.get(id)?.el ?? -90) >= 0;
            })
            .map<PlanetResult>((id) => ({ kind: 'planet', id }));

    const matchingStars =
      category === 'solar'
        ? []
        : BRIGHT_STARS
            .filter((star) => {
              const nameMatches =
                !normalized ||
                star.name.toLowerCase().includes(normalized) ||
                star.designation.toLowerCase().includes(normalized) ||
                star.id.toLowerCase().includes(normalized);

              if (!nameMatches) return false;
              if (brightStarsOnly && star.mag > 2.2) return false;

              if (visibleOnly) {
                const horizontal = raDecToAltAz(
                  star.ra,
                  star.dec,
                  now,
                  observer,
                );
                if (horizontal.el < 0) return false;
              }

              return true;
            })
            .sort((a, b) => a.mag - b.mag)
            .slice(
              0,
              normalized
                ? 50
                : brightStarsOnly
                  ? 40
                  : category === 'stars'
                    ? 60
                    : 24,
            )
            .map<StarResult>((star) => ({ kind: 'star', star }));

    return [...matchingPlanets, ...matchingStars].slice(0, 60);
  }, [
    brightStarsOnly,
    category,
    now,
    observer,
    planets,
    query,
    visibleOnly,
  ]);

  useEffect(() => {
    if (!selected) return;
    const selectedKey = resultKey(selected);
    if (!results.some((result) => resultKey(result) === selectedKey)) {
      setSelected(null);
    }
  }, [results, selected]);

  const selectedDetail = useMemo(() => {
    if (!selected) return null;

    if (selected.kind === 'star') {
      const horizontal = raDecToAltAz(
        selected.star.ra,
        selected.star.dec,
        now,
        observer,
      );

      return {
        name: selected.star.name,
        kind: 'STAR',
        color: selected.star.color,
        subtitle: selected.star.designation,
        altitude: horizontal.el,
        azimuth: horizontal.az,
        rows: [
          ['Apparent magnitude', selected.star.mag.toFixed(2)],
          ['Right ascension', `${selected.star.ra.toFixed(4)}°`],
          ['Declination', `${selected.star.dec.toFixed(4)}°`],
          [
            'Temperature',
            selected.star.temperatureK
              ? `~${Math.round(selected.star.temperatureK).toLocaleString()} K`
              : 'Not in catalogue',
          ],
        ],
      };
    }

    const planet = planets.find((item) => item.id === selected.id);
    const info = PLANET_INFO[selected.id];

    if (!planet) return null;

    return {
      name: info.name,
      kind: selected.id === 'sun' ? 'STAR' : selected.id === 'moon' ? 'MOON' : 'PLANET',
      color: info.color,
      subtitle: 'Solar System',
      altitude: planet.el,
      azimuth: planet.az,
      rows: [
        ['Right ascension', `${planet.ra.toFixed(4)}°`],
        ['Declination', `${planet.dec.toFixed(4)}°`],
        ['Observer', observerLabel],
        [
          'Visibility',
          planet.el >= 0 ? 'Above the horizon' : 'Below the horizon',
        ],
      ],
    };
  }, [now, observer, observerLabel, planets, selected]);

  function showSelectedInSky() {
    if (!selected || !selectedDetail || selectedDetail.altitude < 0) return;

    router.push({
      pathname: '/sky',
      params: {
        targetKind: selected.kind,
        targetId:
          selected.kind === 'star' ? selected.star.id : selected.id,
      },
    });
  }

  return (
    <AppScreen>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StarField />

        <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: '700',
            }}
          >
            Objects
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            2,887 catalogue stars · Sun · Moon · planets
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search stars and planets…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={{
              minHeight: 48,
              marginTop: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: 'rgba(9,18,33,0.94)',
              color: colors.text,
              fontSize: 15,
              paddingHorizontal: 15,
            }}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              gap: 8,
              paddingTop: 10,
              paddingBottom: 2,
            }}
          >
            {categories.map((item) => {
              const active = category === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCategory(item.key)}
                  style={{
                    minHeight: 38,
                    justifyContent: 'center',
                    paddingHorizontal: 13,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active
                      ? colors.accentSoft
                      : 'rgba(9,18,33,0.9)',
                  }}
                >
                  <Text
                    style={{
                      color: active ? colors.text : colors.muted,
                      fontSize: 11,
                      fontWeight: active ? '700' : '600',
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: visibleOnly }}
              onPress={() => setVisibleOnly((value) => !value)}
              style={{
                minHeight: 38,
                justifyContent: 'center',
                paddingHorizontal: 13,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: visibleOnly ? colors.success : colors.border,
                backgroundColor: visibleOnly
                  ? 'rgba(24,72,52,0.72)'
                  : 'rgba(9,18,33,0.9)',
              }}
            >
              <Text
                style={{
                  color: visibleOnly ? colors.text : colors.muted,
                  fontSize: 11,
                  fontWeight: '600',
                }}
              >
                Visible now
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: brightStarsOnly }}
              disabled={category === 'solar'}
              onPress={() => setBrightStarsOnly((value) => !value)}
              style={{
                minHeight: 38,
                justifyContent: 'center',
                paddingHorizontal: 13,
                borderRadius: 13,
                borderWidth: 1,
                borderColor:
                  brightStarsOnly && category !== 'solar'
                    ? colors.warning
                    : colors.border,
                backgroundColor:
                  brightStarsOnly && category !== 'solar'
                    ? 'rgba(76,54,18,0.72)'
                    : 'rgba(9,18,33,0.9)',
                opacity: category === 'solar' ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  color:
                    brightStarsOnly && category !== 'solar'
                      ? colors.text
                      : colors.muted,
                  fontSize: 11,
                  fontWeight: '600',
                }}
              >
                Bright stars
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 28,
          }}
        >
          {selectedDetail ? (
            <View
              style={{
                marginBottom: 14,
                borderRadius: 20,
                padding: 16,
                backgroundColor: 'rgba(9,18,33,0.96)',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: 1.2,
                    }}
                  >
                    {selectedDetail.kind}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 24,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {selectedDetail.name}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    {selectedDetail.subtitle}
                  </Text>
                </View>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: selectedDetail.color,
                    marginTop: 4,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: colors.background,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    ALTITUDE
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 19,
                      fontWeight: '700',
                      marginTop: 3,
                    }}
                  >
                    {selectedDetail.altitude.toFixed(1)}°
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: colors.background,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    AZIMUTH
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 19,
                      fontWeight: '700',
                      marginTop: 3,
                    }}
                  >
                    {selectedDetail.azimuth.toFixed(1)}°
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                {selectedDetail.rows.map(([key, value]) => (
                  <View
                    key={key}
                    style={{
                      minHeight: 36,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 11,
                        flex: 1,
                      }}
                    >
                      {key}
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 11,
                        fontWeight: '600',
                        textAlign: 'right',
                        flex: 1,
                      }}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  disabled={selectedDetail.altitude < 0}
                  onPress={showSelectedInSky}
                  style={{
                    minHeight: 42,
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor:
                      selectedDetail.altitude >= 0
                        ? colors.accent
                        : colors.panelSoft,
                    opacity: selectedDetail.altitude >= 0 ? 1 : 0.55,
                  }}
                >
                  <Text
                    style={{
                      color:
                        selectedDetail.altitude >= 0
                          ? '#fff'
                          : colors.muted,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {selectedDetail.altitude >= 0
                      ? 'Show in Sky'
                      : 'Below horizon'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelected(null)}
                  style={{
                    minHeight: 42,
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Close
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.1,
              marginBottom: 7,
            }}
          >
            {query.trim()
              ? 'SEARCH RESULTS'
              : category === 'stars'
                ? 'STARS'
                : category === 'solar'
                  ? 'SOLAR SYSTEM'
                  : visibleOnly
                    ? 'VISIBLE OBJECTS'
                    : 'FEATURED OBJECTS'}
          </Text>

          {results.map((result) => {
            const isStar = result.kind === 'star';
            const planet = isStar
              ? null
              : planets.find((item) => item.id === result.id);
            const name = resultName(result);
            const detail = isStar
              ? `${result.star.designation} · mag ${result.star.mag.toFixed(2)}`
              : planet
                ? `${planet.el >= 0 ? 'Above' : 'Below'} horizon · alt ${planet.el.toFixed(1)}°`
                : 'Solar System';
            const dotColor = isStar
              ? result.star.color
              : PLANET_INFO[result.id].color;

            return (
              <Pressable
                key={resultKey(result)}
                accessibilityRole="button"
                onPress={() => setSelected(result)}
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
                  borderColor:
                    selected && resultKey(selected) === resultKey(result)
                      ? colors.accent
                      : colors.border,
                }}
              >
                <View
                  style={{
                    width: isStar ? 7 : 10,
                    height: isStar ? 7 : 10,
                    borderRadius: isStar ? 3.5 : 5,
                    backgroundColor: dotColor,
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
                    {name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.muted,
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    {detail}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 16,
                    marginLeft: 8,
                  }}
                >
                  ›
                </Text>
              </Pressable>
            );
          })}

          {results.length === 0 ? (
            <View
              style={{
                padding: 18,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: 'rgba(9,18,33,0.9)',
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                No matching object
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 4,
                }}
              >
                Try a common name, Bayer/Flamsteed designation, catalogue ID, or relax the active filters.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </AppScreen>
  );
}
