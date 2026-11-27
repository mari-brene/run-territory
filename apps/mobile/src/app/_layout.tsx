import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RunProvider } from '../lib/run';
import { SessionProvider } from '../lib/session';
import { theme } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RunProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.bg },
              headerTintColor: theme.text,
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: theme.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Entrar' }} />
            <Stack.Screen name="register" options={{ title: 'Criar conta' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="run" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="summary/[id]" options={{ title: 'Resumo da corrida' }} />
            <Stack.Screen name="player/[id]" options={{ title: 'Jogador' }} />
            <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
            <Stack.Screen name="challenge/new" options={{ title: 'Novo desafio' }} />
            <Stack.Screen name="region/[id]" options={{ title: 'Bairro' }} />
          </Stack>
        </RunProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
