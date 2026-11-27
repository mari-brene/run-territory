// Ranking por território, distância e conquistas (semanal, mensal e geral) e disputa por bairros.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Dim, PlayerBadge, Screen, Segmented } from '../../components/ui';
import { api, type RankingRow, type Region } from '../../lib/api';
import { formatArea, formatDistance } from '../../lib/format';
import { useSession } from '../../lib/session';
import { font, lift, theme } from '../../lib/theme';

type By = 'area' | 'distance' | 'conquests';
type Period = 'week' | 'month' | 'all';

export default function Ranking() {
  const [mode, setMode] = useState<'players' | 'regions'>('players');
  return (
    <Screen style={{ padding: 16, gap: 10 }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'players', label: 'Jogadores' }, { value: 'regions', label: 'Bairros' }]} />
      {mode === 'players' ? <PlayersRanking /> : <RegionsList />}
    </Screen>
  );
}

function RegionsList() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api
      .regions()
      .then(setRegions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);
  return (
    <FlatList
      data={regions}
      keyExtractor={(r) => String(r.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
      ListEmptyComponent={
        <Dim style={{ textAlign: 'center', marginTop: 30 }}>Nenhum bairro cadastrado no servidor ainda (veja docs/BAIRROS.md).</Dim>
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/region/${item.id}`)} style={[st.row, item.myAreaM2 > 0 && item.leader?.areaM2 === item.myAreaM2 && st.me]}>
          {item.leader ? <PlayerBadge name={item.leader.username} color={item.leader.color} size={38} /> : <PlayerBadge name="?" color={theme.textDim} size={38} />}
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{item.name}</Text>
            <Dim style={{ fontSize: 12 }}>
              {item.leader ? `👑 ${item.leader.username} · ${(item.leader.share * 100).toFixed(1).replace('.', ',')}%` : 'Sem dono'}
              {item.players > 1 ? ` · ${item.players} na disputa` : ''}
            </Dim>
          </View>
          {item.myAreaM2 > 0 && <Text style={st.value}>{formatArea(item.myAreaM2)}</Text>}
        </Pressable>
      )}
    />
  );
}

function PlayersRanking() {
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
    <>
      <Segmented<By> value={by} onChange={setBy} options={[{ value: 'area', label: 'Território' }, { value: 'distance', label: 'Distância' }, { value: 'conquests', label: 'Conquistas' }]} />
      <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'all', label: 'Geral' }]} />
      <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'Todos' }, { value: 'friends', label: 'Eu e aliados' }]} />
      {by === 'area' && period !== 'all' && <Dim>Área conquistada no período (o geral mostra o território atual).</Dim>}
      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.userId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
        ListHeaderComponent={rows.length ? <Podium rows={rows.slice(0, 3)} me={user?.id} fmt={fmt} /> : undefined}
        ListEmptyComponent={rows.length ? undefined : <Dim style={{ textAlign: 'center', marginTop: 30 }}>Ninguém no ranking ainda.</Dim>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/player/${item.userId}`)} style={[st.row, item.userId === user?.id && st.me]}>
            <Text style={st.rank}>{item.rank}</Text>
            <PlayerBadge name={item.username} color={item.color} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.username}</Text>
              <Dim style={{ fontSize: 12 }}>Nível {item.level}</Dim>
            </View>
            <Text style={st.value}>{fmt(item.value)}</Text>
          </Pressable>
        )}
      />
    </>
  );
}

/** Os três primeiros em degraus de ouro, prata e bronze (o 1º no meio). */
function Podium({ rows, me, fmt }: { rows: RankingRow[]; me?: string; fmt: (v: number) => string }) {
  const order = [rows[1], rows[0], rows[2]];
  const step = [
    { h: 58, c: ['#C9D3E6', '#8D9BB8'] },
    { h: 80, c: ['#FFD45C', theme.xpDeep] },
    { h: 44, c: ['#F4B488', '#D07A43'] },
  ];
  return (
    <View style={st.podium}>
      {order.map((r, i) =>
        r ? (
          <Pressable key={r.userId} style={st.pod} onPress={() => router.push(`/player/${r.userId}`)}>
            {r.rank === 1 && <Text style={{ fontSize: 22, marginBottom: -4 }}>👑</Text>}
            <PlayerBadge name={r.username} color={r.color} size={r.rank === 1 ? 62 : 50} />
            <Text style={[st.podName, r.userId === me && { color: theme.run }]} numberOfLines={1}>
              {r.userId === me ? 'você' : r.username}
            </Text>
            <Text style={st.podValue} numberOfLines={1}>
              {fmt(r.value)}
            </Text>
            <View style={[st.step, { height: step[i].h, backgroundColor: step[i].c[1], borderTopColor: step[i].c[0] }]}>
              <Text style={st.stepText}>{r.rank}</Text>
            </View>
          </Pressable>
        ) : (
          <View key={i} style={st.pod} />
        ),
      )}
    </View>
  );
}

const st = StyleSheet.create({
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, marginBottom: 14 },
  pod: { flex: 1, alignItems: 'center', gap: 3 },
  podName: { fontFamily: font.display, fontSize: 14, color: theme.text, maxWidth: '100%' },
  podValue: { fontFamily: font.bodyBold, fontSize: 12, color: theme.textDim, fontVariant: ['tabular-nums'] },
  step: { width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderTopWidth: 6, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: font.display, fontSize: 26, color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.surface, borderRadius: 20, marginBottom: 8, borderWidth: 2, borderColor: 'transparent', ...lift(3) },
  me: { borderColor: theme.run, backgroundColor: '#FFEDE4' },
  rank: { color: theme.textDim, fontFamily: font.display, fontSize: 18, width: 26, textAlign: 'center' },
  name: { color: theme.text, fontFamily: font.display, fontSize: 16 },
  value: { color: theme.text, fontFamily: font.bodyBlack, fontVariant: ['tabular-nums'] },
});
