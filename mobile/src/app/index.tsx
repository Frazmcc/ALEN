import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { StarField } from '@/components/StarField';
import { colors } from '@/theme/colors';

export default function WelcomeScreen() {
  return (
    <AppScreen withNav={false}>
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.background }}>
        <StarField />

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '42%',
            backgroundColor: colors.horizonDeep,
            opacity: 0.45,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '24%',
            backgroundColor: colors.horizon,
            opacity: 0.28,
          }}
        />

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 44,
              fontWeight: '300',
              letterSpacing: 12,
              marginLeft: 12,
            }}
          >
            ALEN
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 16,
              marginTop: 12,
              textAlign: 'center',
            }}
          >
            Your window to the real sky
          </Text>

          <View style={{ height: 150 }} />

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/sky')}
            style={{
              minHeight: 52,
              minWidth: 220,
              paddingHorizontal: 28,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 18,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              Get Started
            </Text>
          </Pressable>

          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 14 }}>
            Android + iOS companion to ALEN
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}
