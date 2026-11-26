// Ranking por território, distância e conquistas (semanal, mensal e geral).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ColorDot, Dim, Screen, Segmented } from '../../components/ui';
import { api, type RankingRow } from '../../lib/api';
import { formatArea, formatDistance } from '../../lib/format';
import { useSession } from '../../lib/session';
import { theme } from '../../lib/theme';

type By = 'area' | 'distance' | 'conquests';
type Period = 'week' | 'month' | 'all';

export default function Ranking() {
  const { user } = useSession();
  const [by, setBy] = useState<By>('area');
  const [period, setPeriod] = useState<Period>('all');
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .rankings(by, period, scope)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [by, period, scope]);
  useFocusEffect(load);

  const fmt = (v: number) => (by === 'area' ? formatArea(v) : by === 'distance' ? formatDistance(v) : `${v} conquistas`);

  return (
    <Screen style={{ padding: 16, gap: 10 }}>
      <Segmented<By> value={by} onChange={setBy} options={[{ value: 'area', label: 'Território' }, { value: 'distance', label: 'Distância' }, { value: 'conquests', label: 'Conquistas' }]} />
      <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'all', label: 'Geral' }]} />
      <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'Todos' }, { value: 'friends', label: 'Eu e aliados' }]} />
      {by === 'area' && period !== 'all' && <Dim>Área conquistada no período (o geral mostra o território atual).</Dim>}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.userId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
        ListEmptyComponent={<Dim style={{ textAlign: 'center', marginTop: 30 }}>Ninguém no ranking ainda.</Dim>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/player/${item.userId}`)} style={[st.row, item.userId === user?.id && st.me]}>
            <Text style={[st.rank, item.rank <= 3 && { color: ['#FFD700', '#C0C0C0', '#CD7F32'][item.rank - 1] }]}>{item.rank}</Text>
            <ColorDot color={item.color} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.username}</Text>
              <Dim style={{ fontSize: 12 }}>Nível {item.level}</Dim>
            </View>
            <Text style={st.value}>{fmt(item.value)}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: theme.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  me: { borderColor: theme.accent },
  rank: { color: theme.textDim, fontWeight: '900', fontSize: 20, width: 30, textAlign: 'center' },
  name: { color: theme.text, fontWeight: '800', fontSize: 16 },
  value: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
