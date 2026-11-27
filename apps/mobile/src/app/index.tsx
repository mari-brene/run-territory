// Tela inicial
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { useSession } from '../lib/session';
import { font, theme } from '../lib/theme';

export default function Welcome() {
  const { ready, user, settings } = useSession();
  if (!ready)
    return (
      <View style={[st.root, { justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  if (user) return <Redirect href="/map" />;

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hero}>
        <View style={st.hexRow}>
          {[theme.run, theme.accent, theme.xp].map((c) => (
            <View key={c} style={[st.hex, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={st.brand}>RUN{'\n'}TERRITORY</Text>
        <Text style={st.tag}>Corra pela cidade. Feche o percurso. Domine o mapa.</Text>
        <View style={st.rules}>
          <Text style={st.rule}>① Saia do seu território e desenhe um rastro</Text>
          <Text style={st.rule}>② Volte para casa e a área fechada vira sua</Text>
          <Text style={st.rule}>③ Invada áreas rivais para tomá-las</Text>
        </View>
      </View>
      <View style={{ gap: 12, padding: 24 }}>
        <Button title="Criar conta" variant="run" onPress={() => router.push('/register')} />
        <Button title="Já tenho conta" variant="ghost" onPress={() => router.push('/login')} />
        <Text style={st.server} onPress={() => router.push('/settings')}>
          ⚙ Configurar servidor · {settings.apiUrl}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  hero: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  hexRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  hex: { width: 34, height: 34, borderRadius: 10, transform: [{ rotate: '45deg' }], opacity: 0.9 },
  brand: { color: theme.text, fontSize: 54, fontFamily: font.display, lineHeight: 56 },
  tag: { color: theme.textDim, fontSize: 17, marginTop: 14, lineHeight: 24, fontFamily: font.body },
  rules: { marginTop: 32, gap: 10 },
  rule: { color: theme.text, fontSize: 15, fontFamily: font.bodyBold },
  server: { color: theme.textDim, fontSize: 13, textAlign: 'center', marginTop: 4, padding: 8 },
});
