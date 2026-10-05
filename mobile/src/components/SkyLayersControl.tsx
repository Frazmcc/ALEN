import { Pressable, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

export type SkyLayers = {
  stars: boolean;
  constellations: boolean;
  planets: boolean;
  atmosphere: boolean;
  landscape: boolean;
  aircraft: boolean;
  satellites: boolean;
};

type Props = {
  open: boolean;
  layers: SkyLayers;
  onToggleOpen: () => void;
  onToggleLayer: (layer: keyof SkyLayers) => void;
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
  { key: 'aircraft', label: 'Aircraft', group: 'Live' },
  { key: 'satellites', label: 'Satellites', group: 'Live' },
];

export function SkyLayersControl({
  open,
  layers,
  onToggleOpen,
  onToggleLayer,
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
          {(['Astronomy', 'Live', 'Display'] as const).map((group) => (
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
                      <Text
                        style={{
                          color: enabled ? colors.text : colors.muted,
                          fontSize: 12,
                          fontWeight: enabled ? '700' : '500',
                        }}
                      >
                        {option.label}
                      </Text>
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
