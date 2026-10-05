import { Text, View } from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { StarField } from '@/components/StarField';
import { colors } from '@/theme/colors';

export function PlaceholderScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: 24, paddingTop: 32 }}>
        <StarField />
        <Text
          style={{
            color: colors.text,
            fontSize: 30,
            fontWeight: '700',
            letterSpacing: 0.2,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 16,
            lineHeight: 24,
            marginTop: 10,
            maxWidth: 520,
          }}
        >
          {subtitle}
        </Text>
      </View>
    </AppScreen>
  );
}
