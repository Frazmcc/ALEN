import { useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { LocationControl } from '@/components/LocationControl';
import { StarField } from '@/components/StarField';
import { useObserverLocation } from '@/location/useObserverLocation';
import { colors } from '@/theme/colors';
import { clearSkyPreferences } from '@/preferences/skyPreferences';

const WEBSITE_URL = 'https://frazmcc.github.io/ALEN';
const SOURCE_URL = 'https://github.com/Frazmcc/ALEN';

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Text
        style={{
          flex: 1,
          color: colors.muted,
          fontSize: 11,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flex: 1.35,
          color: colors.text,
          fontSize: 11,
          fontWeight: '600',
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text
        style={{
          color: colors.muted,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1.1,
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          padding: 15,
          borderRadius: 18,
          backgroundColor: 'rgba(9,18,33,0.94)',
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const {
    observer,
    source,
    label,
    requesting,
    restoring,
    error,
    useCurrentLocation,
    useManualLocation,
    useDemoLocation,
    clearSavedObserver,
  } = useObserverLocation();

  const [localDataStatus, setLocalDataStatus] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '0.1.0';

  async function resetSkyPreferences() {
    const cleared = await clearSkyPreferences();
    setLocalDataStatus(
      cleared
        ? 'Sky display preferences cleared. Default layer settings will apply next time the Sky screen opens.'
        : 'ALEN could not clear the saved sky display preferences.',
    );
  }

  function confirmClearLocalData() {
    Alert.alert(
      'Clear ALEN local data?',
      'This clears the saved observer choice and sky display preferences stored by ALEN on this device. It does not revoke system permissions or delete any server-side data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear local data',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const [skyCleared, observerCleared] = await Promise.all([
                clearSkyPreferences(),
                clearSavedObserver(),
              ]);

              setLocalDataStatus(
                skyCleared && observerCleared
                  ? 'ALEN local data cleared. The observer is now the Greenwich demo and sky settings will use defaults.'
                  : 'Some local data could not be cleared. The active observer has been reset where possible.',
              );
            })();
          },
        },
      ],
    );
  }

  return (
    <AppScreen>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StarField />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 30,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: '700',
            }}
          >
            More
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 18,
              marginTop: 4,
            }}
          >
            Location, privacy, data sources and ALEN information.
          </Text>

          <Section title="OBSERVER LOCATION">
            <View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: '700',
                }}
              >
                {restoring ? 'Restoring observer…' : label}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 10,
                  lineHeight: 15,
                  marginTop: 3,
                }}
              >
                {observer.lat.toFixed(5)}, {observer.lon.toFixed(5)}
              </Text>

              <View style={{ alignItems: 'flex-start', marginTop: 12 }}>
                <LocationControl
                  observer={observer}
                  source={source}
                  label={label}
                  requesting={requesting}
                  restoring={restoring}
                  error={error}
                  onUseCurrent={useCurrentLocation}
                  onUseManual={useManualLocation}
                  onUseDemo={useDemoLocation}
                />
              </View>
            </View>

            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                lineHeight: 16,
                marginTop: 12,
              }}
            >
              This observer position controls the sky ALEN calculates. Manual
              locations can be saved locally; current GPS coordinates are not
              persisted.
            </Text>
          </Section>

          <Section title="PRIVACY & DATA">
            <InfoRow label="Astronomy calculations" value="On-device" />
            <InfoRow label="Location permission" value="Foreground only" />
            <InfoRow label="GPS coordinates saved" value="No" />
            <InfoRow label="Live satellites / aircraft" value="Off on launch" />
            <InfoRow
              label="Observer coordinates sent"
              value="Only to ALEN API when a live layer is enabled"
            />
            <InfoRow label="Advertising / tracking" value="None" />
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                lineHeight: 16,
                marginTop: 10,
              }}
            >
              Compass and motion readings used by Aim with phone stay on the
              device and are removed when phone aiming is turned off.
            </Text>
          </Section>

          <Section title="LOCAL DATA">
            <InfoRow label="Saved GPS coordinates" value="None" />
            <InfoRow label="Manual observer" value="Stored on-device when selected" />
            <InfoRow label="Sky layer preferences" value="Stored on-device" />
            <InfoRow label="Live aircraft/satellite cache" value="Not persisted on-device" />

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 12,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => void resetSkyPreferences()}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelSoft,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
                  Reset sky preferences
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={confirmClearLocalData}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.warning,
                  backgroundColor: 'rgba(58,36,18,0.55)',
                }}
              >
                <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '700' }}>
                  Clear ALEN local data
                </Text>
              </Pressable>
            </View>

            {localDataStatus ? (
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 10,
                  lineHeight: 16,
                  marginTop: 10,
                }}
              >
                {localDataStatus}
              </Text>
            ) : null}
          </Section>

          <Section title="DATA SOURCES">
            <InfoRow label="Stars" value="2,887-star local catalogue" />
            <InfoRow label="Sun, Moon & planets" value="Calculated on-device" />
            <InfoRow label="Satellites" value="ALEN API · orbital data" />
            <InfoRow label="Aircraft" value="ALEN API · ADS-B data" />
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                lineHeight: 16,
                marginTop: 10,
              }}
            >
              Live feeds can temporarily become stale or unavailable. ALEN
              keeps astronomical calculations independent from those network
              services.
            </Text>
          </Section>

          <Section title="ABOUT ALEN">
            <InfoRow label="App version" value={version} />
            <InfoRow label="Platform" value="Android + iOS companion" />
            <InfoRow
              label="Goal"
              value="Observer-accurate live sky alignment"
            />

            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                lineHeight: 16,
                marginTop: 10,
              }}
            >
              ALEN — Astronomical Live Environment & Navigation — is designed
              to show the sky from the selected observer position with real
              geometry, time and viewing direction.
            </Text>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 14,
              }}
            >
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(WEBSITE_URL)}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  Open ALEN website
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(SOURCE_URL)}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelSoft,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  View source
                </Text>
              </Pressable>
            </View>
          </Section>
        </ScrollView>
      </View>
    </AppScreen>
  );
}
