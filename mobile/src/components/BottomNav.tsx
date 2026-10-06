import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

const items = [
  { label: 'Sky', route: '/sky' },
  { label: 'Objects', route: '/objects' },
  { label: 'AR', route: '/ar' },
  { label: 'Tonight', route: '/tonight' },
  { label: 'More', route: '/more' },
] as const;

type Props = {
  vertical?: boolean;
};

export function BottomNav({ vertical = false }: Props) {
  const pathname = usePathname();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: vertical ? 'column' : 'row',
        width: vertical ? 96 : undefined,
        borderTopWidth: vertical ? 0 : 1,
        borderRightWidth: vertical ? 1 : 0,
        borderTopColor: colors.border,
        borderRightColor: colors.border,
        backgroundColor: 'rgba(2,7,17,0.96)',
        paddingVertical: 8,
        paddingHorizontal: 8,
        gap: vertical ? 6 : 0,
      }}
    >
      {items.map((item) => {
        const active = pathname === item.route;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.replace(item.route)}
            style={{
              flex: vertical ? undefined : 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: vertical ? 52 : 44,
              borderRadius: 12,
              paddingHorizontal: vertical ? 6 : 4,
              backgroundColor: active ? colors.accentSoft : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.text : colors.muted,
                fontSize: vertical ? 11 : 12,
                fontWeight: active ? '700' : '500',
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
