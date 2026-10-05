import type { PropsWithChildren } from 'react';
import { SafeAreaView, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { colors } from '@/theme/colors';

type Props = PropsWithChildren<{
  withNav?: boolean;
}>;

export function AppScreen({ children, withNav = true }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>{children}</View>
      {withNav ? <BottomNav /> : null}
    </SafeAreaView>
  );
}
