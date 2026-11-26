import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Text, type ColorValue } from 'react-native';
import { useSession } from '../../lib/session';
import { theme } from '../../lib/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { ready, user } = useSession();
  if (ready && !user) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="map" options={{ title: 'Mapa', headerShown: false, tabBarIcon: icon('⬢') }} />
      <Tabs.Screen name="missions" options={{ title: 'Missões', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="ranking" options={{ title: 'Ranking', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos', tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico', tabBarIcon: icon('📜') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
