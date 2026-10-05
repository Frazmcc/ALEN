import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/colors';
import { ObserverProvider } from '@/location/useObserverLocation';

export default function RootLayout() {
  return (
    <ObserverProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      />
    </ObserverProvider>
  );
}
