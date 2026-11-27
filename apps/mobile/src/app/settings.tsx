import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Dim, Input } from '../components/ui';
import { api, normalizeUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { theme } from '../lib/theme';

export default function Settings() {
  const { user, settings, updateSettings, refreshUser, signOut } = useSession();
  const [palette, setPalette] = useState<string[]>([]);
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user) api.palette().then(setPalette).catch(() => {});
  }, [user]);

  const saveAndTest = async () => {
    const url = normalizeUrl(apiUrl);
    setApiUrl(url);
    await updateSettings({ apiUrl: url });
    setTesting(true);
    try {
      await api.health();
      Alert.alert('Conectado!', `O servidor ${url} respondeu.`);
    } catch {
      Alert.alert(
        'Não conectou',
        `O app não conseguiu falar com ${url}.\n\n• O servidor está rodando no computador?\n• O celular está no mesmo Wi-Fi?\n• O endereço é o IP que o servidor mostrou ao iniciar (não "localhost")?`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      {user && (
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
      )}

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
        <Dim style={{ marginBottom: 8 }}>Ex.: http://192.168.0.10:3000 (o endereço que o servidor mostra ao iniciar).</Dim>
        <Input label="Endereço da API" value={apiUrl} onChangeText={setApiUrl} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <Button title="Salvar e testar conexão" variant="secondary" loading={testing} onPress={saveAndTest} />
      </Card>

      {user && (
        <Button
          title="Sair da conta"
          variant="danger"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
      )}
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
