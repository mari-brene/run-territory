import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Text, View, type ColorValue } from 'react-native';
import { useSession } from '../../lib/session';
import { font, lift, theme } from '../../lib/theme';

const icon = (glyph: string) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Text style={{ color, fontSize: 20, opacity: focused ? 1 : 0.7 }}>{glyph}</Text>;
  };

/** O mapa é o botão do meio, maior e sempre colorido. */
function MapIcon() {
  return (
    <View
      style={{
        width: 54,
        height: 54,
        marginTop: -22,
        borderRadius: 27,
        backgroundColor: theme.accent,
        borderWidth: 4,
        borderColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
        ...lift(8),
      }}
    >
      <Text style={{ fontSize: 22, color: '#FFFFFF' }}>📍</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { ready, user } = useSession();
  if (ready && !user) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: font.display, fontSize: 24 },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, height: 68, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 11 },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="missions" options={{ title: 'Missões', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="ranking" options={{ title: 'Ranking', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa', headerShown: false, tabBarIcon: MapIcon }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos', tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('👤') }} />
      {/* Histórico sai da barra (fica no Perfil) para o Mapa ficar no meio. */}
      <Tabs.Screen name="history" options={{ title: 'Histórico', href: null }} />
    </Tabs>
  );
}
