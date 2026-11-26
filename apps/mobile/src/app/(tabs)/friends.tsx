// Amigos (aliados): aparecem com contorno tracejado no mapa e no ranking "Eu e aliados".
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ColorDot, Dim, Input, Screen } from '../../components/ui';
import { api, type Friend } from '../../lib/api';
import { formatArea } from '../../lib/format';
import { theme } from '../../lib/theme';

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; color: string }[]>([]);

  const load = useCallback(() => {
    api.friends().then(setFriends).catch(() => {});
  }, []);
  useFocusEffect(load);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    api.searchUsers(text).then(setResults).catch(() => {});
  };

  const add = async (username: string) => {
    try {
      await api.addFriend(username);
      setQ('');
      setResults([]);
      load();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  return (
    <Screen style={{ padding: 16 }}>
      <Input label="Adicionar aliado" placeholder="Buscar por nome de corredor" value={q} onChangeText={search} />
      {results.map((r) => (
        <View key={r.id} style={st.row}>
          <ColorDot color={r.color} />
          <Text style={[st.name, { flex: 1 }]}>{r.username}</Text>
          <Button title="Adicionar" onPress={() => add(r.username)} style={{ height: 38, paddingHorizontal: 14 }} />
        </View>
      ))}
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={<Text style={st.h}>Seus aliados ({friends.length})</Text>}
        ListEmptyComponent={<Dim>Adicione amigos para ver os territórios deles destacados no mapa e disputar no ranking entre aliados.</Dim>}
        renderItem={({ item }) => (
          <Pressable style={st.row} onPress={() => router.push(`/player/${item.id}`)}>
            <ColorDot color={item.color} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.username}</Text>
              <Dim style={{ fontSize: 12 }}>Nível {item.level} · {formatArea(item.areaM2)}</Dim>
            </View>
            <Text style={{ color: theme.textDim }}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={
          <Card style={{ marginTop: 16 }}>
            <Text style={st.h}>Desafios</Text>
            <Dim>Em breve: desafie um aliado para ver quem conquista mais área na semana. A base (amizades, ranking por período e histórico de conquistas) já está pronta no servidor.</Dim>
          </Card>
        }
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: theme.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  name: { color: theme.text, fontWeight: '800', fontSize: 16 },
  h: { color: theme.text, fontWeight: '800', fontSize: 16, marginVertical: 10 },
});
