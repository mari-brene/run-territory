import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RunProvider } from '../lib/run';
import { SessionProvider } from '../lib/session';
import { font, theme } from '../lib/theme';

export default function RootLayout() {
  // Se as fontes falharem, o app segue com a fonte do sistema.
  const [loaded, error] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_600SemiBold, Nunito_800ExtraBold, Nunito_900Black });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RunProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.bg },
              headerTintColor: theme.text,
              headerTitleStyle: { fontFamily: font.display, fontSize: 20 },
              headerShadowVisible: false,
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
            <Stack.Screen name="customize" options={{ title: 'Personalizar' }} />
          </Stack>
        </RunProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
