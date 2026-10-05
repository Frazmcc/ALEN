import { Pressable, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import {
  SATELLITE_GROUPS,
  type SatelliteGroupKey,
  type SatelliteGroupState,
} from '@/live/satelliteGroups';
import {
  AIRCRAFT_GROUPS,
  type AircraftGroupKey,
  type AircraftGroupState,
} from '@/live/aircraftGroups';

export type SkyLayers = {
  stars: boolean;
  constellations: boolean;
  planets: boolean;
  atmosphere: boolean;
  landscape: boolean;
  satellites: boolean;
  aircraft: boolean;
};

type Props = {
  open: boolean;
  layers: SkyLayers;
  onToggleOpen: () => void;
  onToggleLayer: (layer: keyof SkyLayers) => void;
  satelliteSummary?: string;
  satelliteGroups: SatelliteGroupState;
  onToggleSatelliteGroup: (group: SatelliteGroupKey) => void;
  aircraftGroups: AircraftGroupState;
  onToggleAircraftGroup: (group: AircraftGroupKey) => void;
  aircraftSummary?: string;
};

const options: Array<{
  key: keyof SkyLayers;
  label: string;
  group: 'Astronomy' | 'Display' | 'Live';
}> = [
  { key: 'stars', label: 'Stars', group: 'Astronomy' },
  { key: 'constellations', label: 'Constellations', group: 'Astronomy' },
  { key: 'planets', label: 'Planets', group: 'Astronomy' },
  { key: 'atmosphere', label: 'Atmosphere', group: 'Display' },
  { key: 'landscape', label: 'Landscape', group: 'Display' },
  { key: 'satellites', label: 'Satellites', group: 'Live' },
  { key: 'aircraft', label: 'Aircraft', group: 'Live' },
];

export function SkyLayersControl({
  open,
  layers,
  onToggleOpen,
  onToggleLayer,
  satelliteSummary,
  satelliteGroups,
  onToggleSatelliteGroup,
  aircraftGroups,
  onToggleAircraftGroup,
  aircraftSummary,
}: Props) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 18,
        top: 86,
        alignItems: 'flex-start',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sky layers"
        accessibilityState={{ expanded: open }}
        onPress={onToggleOpen}
        style={{
          minHeight: 42,
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: 'rgba(9,18,33,0.94)',
          borderWidth: 1,
          borderColor: open ? colors.accent : colors.border,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
          Layers
        </Text>
      </Pressable>

      {open ? (
        <View
          style={{
            width: 210,
            marginTop: 8,
            padding: 12,
            borderRadius: 16,
            backgroundColor: 'rgba(5,12,23,0.97)',
            borderWidth: 1,
            borderColor: colors.border,
            gap: 8,
          }}
        >
          {(['Astronomy', 'Display', 'Live'] as const).map((group) => (
            <View key={group} style={{ gap: 6 }}>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                }}
              >
                {group}
              </Text>

              {options
                .filter((option) => option.group === group)
                .map((option) => {
                  const enabled = layers[option.key];

                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: enabled }}
                      onPress={() => onToggleLayer(option.key)}
                      style={{
                        minHeight: 40,
                        paddingHorizontal: 10,
                        borderRadius: 11,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: enabled
                          ? 'rgba(23,54,94,0.72)'
                          : 'rgba(10,20,36,0.8)',
                        borderWidth: 1,
                        borderColor: enabled ? colors.accent : colors.border,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text
                          style={{
                            color: enabled ? colors.text : colors.muted,
                            fontSize: 12,
                            fontWeight: enabled ? '700' : '500',
                          }}
                        >
                          {option.label}
                        </Text>
                        {option.key === 'satellites' && satelliteSummary ? (
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 9,
                              marginTop: 2,
                            }}
                          >
                            {satelliteSummary}
                          </Text>
                        ) : null}
                        {option.key === 'satellites' && enabled ? (
                          <View
                            style={{
                              marginTop: 8,
                              gap: 5,
                            }}
                          >
                            {SATELLITE_GROUPS.map((group) => {
                              const groupEnabled = satelliteGroups[group.key];
                              return (
                                <Pressable
                                  key={group.key}
                                  accessibilityRole="switch"
                                  accessibilityState={{ checked: groupEnabled }}
                                  onPress={() => onToggleSatelliteGroup(group.key)}
                                  style={{
                                    minHeight: 30,
                                    paddingHorizontal: 8,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: groupEnabled
                                      ? 'rgba(23,54,94,0.5)'
                                      : 'rgba(10,20,36,0.7)',
                                    borderWidth: 1,
                                    borderColor: groupEnabled
                                      ? group.color
                                      : colors.border,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: groupEnabled ? colors.text : colors.muted,
                                      fontSize: 10,
                                    }}
                                  >
                                    {group.label}
                                  </Text>
                                  <Text
                                    style={{
                                      color: groupEnabled ? group.color : colors.muted,
                                      fontSize: 9,
                                      fontWeight: '700',
                                    }}
                                  >
                                    {groupEnabled ? 'ON' : 'OFF'}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                        {option.key === 'aircraft' && aircraftSummary ? (
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 9,
                              marginTop: 2,
                            }}
                          >
                            {aircraftSummary}
                          </Text>
                        ) : null}
                        {option.key === 'aircraft' && enabled ? (
                          <View
                            style={{
                              marginTop: 8,
                              gap: 5,
                            }}
                          >
                            {AIRCRAFT_GROUPS.map((group) => {
                              const groupEnabled = aircraftGroups[group.key];
                              return (
                                <Pressable
                                  key={group.key}
                                  accessibilityRole="switch"
                                  accessibilityState={{ checked: groupEnabled }}
                                  onPress={() => onToggleAircraftGroup(group.key)}
                                  style={{
                                    minHeight: 30,
                                    paddingHorizontal: 8,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: groupEnabled
                                      ? 'rgba(23,54,94,0.5)'
                                      : 'rgba(10,20,36,0.7)',
                                    borderWidth: 1,
                                    borderColor: groupEnabled
                                      ? group.color
                                      : colors.border,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: groupEnabled ? colors.text : colors.muted,
                                      fontSize: 10,
                                    }}
                                  >
                                    {group.label}
                                  </Text>
                                  <Text
                                    style={{
                                      color: groupEnabled ? group.color : colors.muted,
                                      fontSize: 9,
                                      fontWeight: '700',
                                    }}
                                  >
                                    {groupEnabled ? 'ON' : 'OFF'}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          color: enabled ? colors.success : colors.muted,
                          fontSize: 10,
                          fontWeight: '700',
                        }}
                      >
                        {enabled ? 'ON' : 'OFF'}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
