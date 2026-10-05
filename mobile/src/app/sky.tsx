import { Text, View } from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { StarField } from '@/components/StarField';
import { colors } from '@/theme/colors';

export default function SkyScreen() {
  return (
    <AppScreen>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <StarField />

        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(9,18,33,0.84)',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>Tonight · Live</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
              Real sky engine connection next
            </Text>
          </View>
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: '54%',
            top: '33%',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.warning,
            }}
          />
          <Text style={{ color: colors.text, fontSize: 12, marginTop: 6 }}>
            Jupiter
          </Text>
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '32%',
            backgroundColor: '#08121a',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '31%',
            height: 2,
            backgroundColor: colors.horizon,
            opacity: 0.55,
          }}
        />

        <View
          style={{
            position: 'absolute',
            bottom: 24,
            left: 20,
            right: 20,
            padding: 16,
            borderRadius: 18,
            backgroundColor: 'rgba(9,18,33,0.9)',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
            Live Sky
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }}>
            This is the native mobile shell. The next milestone connects the existing ALEN
            renderer, location, compass and motion sensors.
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}
