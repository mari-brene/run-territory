import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Dim, Input } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { theme } from '../lib/theme';

export default function Settings() {
  const { user, settings, updateSettings, refreshUser, signOut } = useSession();
  const [palette, setPalette] = useState<string[]>([]);
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);

  useEffect(() => {
    api.palette().then(setPalette).catch(() => {});
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card>
        <Text style={st.h}>Cor do jogador</Text>
        <View style={st.colors}>
          {palette.map((c) => (
            <Pressable
              key={c}
              onPress={() => api.updateMe(c).then(refreshUser).catch((e) => Alert.alert('Erro', e.message))}
              style={[st.color, { backgroundColor: c }, user?.color === c && st.colorOn]}
            />
          ))}
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={st.h}>Modo simulação</Text>
            <Dim>Para testar sem sair de casa: durante a corrida, toque no mapa e seu corredor vai até o ponto.</Dim>
          </View>
          <Switch value={settings.simulation} onValueChange={(v) => updateSettings({ simulation: v })} trackColor={{ true: theme.accent }} />
        </View>
      </Card>

      <Card>
        <Text style={st.h}>Servidor</Text>
        <Input label="Endereço da API" value={apiUrl} onChangeText={setApiUrl} keyboardType="url" />
        <Button title="Salvar endereço" variant="secondary" onPress={() => updateSettings({ apiUrl: apiUrl.trim() }).then(() => Alert.alert('Salvo', 'Endereço atualizado.'))} />
      </Card>

      <Button
        title="Sair da conta"
        variant="danger"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
      <Dim style={{ textAlign: 'center' }}>Run Territory · MVP 0.1 · Mapa © OpenStreetMap / OpenFreeMap</Dim>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  color: { width: 40, height: 40, borderRadius: 12 },
  colorOn: { borderWidth: 3, borderColor: '#fff' },
});
