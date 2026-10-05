import {
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { colors } from '@/theme/colors';

export type SkyObjectDetail = {
  kind: string;
  name: string;
  subtitle: string;
  color: string;
  altitude: number;
  azimuth: number;
  rows: Array<[string, string]>;
};

type Props = {
  detail: SkyObjectDetail | null;
  onClose: () => void;
  onCentre?: () => void;
};

export function SkyObjectSheet({
  detail,
  onClose,
  onCentre,
}: Props) {
  return (
    <Modal
      visible={Boolean(detail)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close object details"
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      >
        {detail ? (
          <Pressable
            accessibilityRole="none"
            onPress={() => undefined}
            style={{
              padding: 20,
              paddingBottom: 28,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 42,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                marginBottom: 16,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.1,
                  }}
                >
                  {detail.kind}
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 26,
                    fontWeight: '700',
                    marginTop: 2,
                  }}
                >
                  {detail.name}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    marginTop: 3,
                  }}
                >
                  {detail.subtitle}
                </Text>
              </View>

              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: detail.color,
                  marginTop: 6,
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
                    fontSize: 20,
                    fontWeight: '700',
                    marginTop: 3,
                  }}
                >
                  {detail.altitude.toFixed(1)}°
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
                    fontSize: 20,
                    fontWeight: '700',
                    marginTop: 3,
                  }}
                >
                  {detail.azimuth.toFixed(1)}°
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              {detail.rows.map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    minHeight: 38,
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
                    {label}
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
                marginTop: 14,
              }}
            >
              {onCentre ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onCentre}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    Centre object
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={onClose}
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
                  Close
                </Text>
              </Pressable>
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}
