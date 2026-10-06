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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: 'rgba(2,7,17,0.96)',
        paddingVertical: 8,
        paddingHorizontal: 8,
      }}
    >
      {items.map((item) => {
        const active = pathname === item.route;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => router.replace(item.route)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              borderRadius: 12,
              backgroundColor: active ? colors.accentSoft : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? colors.text : colors.muted,
                fontSize: 12,
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
