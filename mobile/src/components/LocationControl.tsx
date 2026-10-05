import { useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Observer } from '@/sky/astronomy';
import type { ObserverSource } from '@/location/useObserverLocation';
import { colors } from '@/theme/colors';

type Props = {
  observer: Observer;
  source: ObserverSource;
  label: string;
  requesting: boolean;
  restoring: boolean;
  error: string | null;
  onUseCurrent: () => Promise<boolean>;
  onUseManual: (
    lat: number,
    lon: number,
    label?: string,
  ) => Promise<boolean>;
  onUseDemo: () => Promise<void>;
};

export function LocationControl({
  observer,
  source,
  label,
  requesting,
  restoring,
  error,
  onUseCurrent,
  onUseManual,
  onUseDemo,
}: Props) {
  const [open, setOpen] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  function openSheet() {
    setManualLabel(source === 'manual' ? label : '');
    setManualLat(observer.lat.toFixed(6));
    setManualLon(observer.lon.toFixed(6));
    setManualError(null);
    setOpen(true);
  }

  async function useCurrent() {
    const changed = await onUseCurrent();
    if (changed) setOpen(false);
  }

  async function saveManual() {
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
        'Latitude must be -90 to 90 and longitude must be -180 to 180.',
      );
      return;
    }

    const saved = await onUseManual(lat, lon, manualLabel);
    if (saved) {
      setManualError(null);
      setOpen(false);
    }
  }

  async function useDemo() {
    await onUseDemo();
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change observer location"
        onPress={openSheet}
        style={{
          alignItems: 'flex-end',
          backgroundColor: 'rgba(9,18,33,0.92)',
          borderWidth: 1,
          borderColor:
            source === 'device'
              ? colors.success
              : source === 'manual'
                ? colors.accent
                : colors.border,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          maxWidth: 190,
        }}
      >
        <Text
          numberOfLines={1}
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
              : label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: colors.muted,
            fontSize: 10,
            marginTop: 2,
          }}
        >
          {source === 'device'
            ? 'Current · tap to change'
            : source === 'manual'
              ? 'Saved · tap to change'
              : 'Demo · tap to change'}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close location chooser"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.58)',
          }}
        >
          <Pressable
            accessibilityRole="none"
            onPress={() => undefined}
            style={{
              backgroundColor: colors.panel,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              paddingBottom: 28,
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

            <Text
              style={{
                color: colors.text,
                fontSize: 23,
                fontWeight: '700',
              }}
            >
              Observer location
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: 13,
                lineHeight: 19,
                marginTop: 6,
              }}
            >
              Choose where ALEN should place the observer. This controls the
              sky you see; it does not change your phone's physical location.
            </Text>

            <View
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 16,
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                CURRENT SELECTION
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: '700',
                  marginTop: 4,
                }}
              >
                {label}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>
                {observer.lat.toFixed(5)}, {observer.lon.toFixed(5)}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={requesting}
              onPress={useCurrent}
              style={{
                minHeight: 48,
                justifyContent: 'center',
                marginTop: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor:
                  source === 'device'
                    ? 'rgba(24,72,52,0.94)'
                    : colors.panelSoft,
                borderWidth: 1,
                borderColor:
                  source === 'device' ? colors.success : colors.border,
                opacity: requesting ? 0.7 : 1,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {requesting ? 'Finding current location…' : 'Use current location'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                Foreground GPS only; coordinates are not saved
              </Text>
            </Pressable>

            <View
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                backgroundColor:
                  source === 'manual'
                    ? 'rgba(23,54,94,0.42)'
                    : colors.panelSoft,
                borderWidth: 1,
                borderColor:
                  source === 'manual' ? colors.accent : colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: '700',
                  marginBottom: 10,
                }}
              >
                Manual location
              </Text>

              <TextInput
                value={manualLabel}
                onChangeText={setManualLabel}
                placeholder="Name, e.g. Mauna Kea"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                style={{
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.text,
                  paddingHorizontal: 12,
                  marginBottom: 8,
                }}
              />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={manualLat}
                  onChangeText={setManualLat}
                  placeholder="Latitude"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    color: colors.text,
                    paddingHorizontal: 12,
                  }}
                />
                <TextInput
                  value={manualLon}
                  onChangeText={setManualLon}
                  placeholder="Longitude"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    color: colors.text,
                    paddingHorizontal: 12,
                  }}
                />
              </View>

              {manualError ? (
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 11,
                    lineHeight: 16,
                    marginTop: 8,
                  }}
                >
                  {manualError}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={saveManual}
                style={{
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 10,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  Use manual location
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={useDemo}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.muted, fontWeight: '600' }}>
                Use Greenwich demo
              </Text>
            </Pressable>

            {error ? (
              <Text
                style={{
                  color: colors.warning,
                  fontSize: 11,
                  lineHeight: 16,
                  marginTop: 12,
                }}
              >
                {error}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
