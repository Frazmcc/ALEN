import type { PropsWithChildren } from 'react';
import { SafeAreaView, View, useWindowDimensions } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { colors } from '@/theme/colors';

type Props = PropsWithChildren<{
  withNav?: boolean;
}>;

export function AppScreen({ children, withNav = true }: Props) {
  const { width, height } = useWindowDimensions();
  const useNavigationRail = withNav && width >= 760 && width > height;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          flexDirection: useNavigationRail ? 'row' : 'column',
        }}
      >
        {useNavigationRail ? <BottomNav vertical /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        {withNav && !useNavigationRail ? <BottomNav /> : null}
      </View>
    </SafeAreaView>
  );
}
