// Ranking de um bairro/região: quem domina agora e quem mais conquistou lá na semana/mês.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { PlayerBadge, Dim, Screen, Segmented } from '../../components/ui';
import { api, type RegionRanking } from '../../lib/api';
import { formatArea } from '../../lib/format';
import { useSession } from '../../lib/session';
import { font, lift, theme } from '../../lib/theme';

type Period = 'now' | 'week' | 'month';

export default function RegionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [period, setPeriod] = useState<Period>('now');
  const [data, setData] = useState<RegionRanking | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .regionRanking(Number(id), period)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, period]);
  useFocusEffect(load);

  return (
    <Screen style={{ padding: 16, gap: 10 }}>
      <Stack.Screen options={{ title: data?.region.name ?? 'Bairro' }} />
      {data && (
        <Dim>
          {data.region.city ? `${data.region.city} · ` : ''}
          {formatArea(data.region.areaM2)}
        </Dim>
      )}
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'now', label: 'Domínio agora' },
          { value: 'week', label: 'Semana' },
          { value: 'month', label: 'Mês' },
        ]}
      />
      <Dim>{period === 'now' ? 'Quanto do bairro é de cada jogador neste momento.' : 'Área conquistada dentro do bairro no período.'}</Dim>
      <FlatList
        data={data?.rows ?? []}
        keyExtractor={(r) => r.userId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
        ListEmptyComponent={<Dim style={{ textAlign: 'center', marginTop: 30 }}>Ninguém conquistou nada aqui ainda. Seja o primeiro!</Dim>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/player/${item.userId}`)} style={[st.row, item.userId === user?.id && st.me]}>
            <Text style={[st.rank, item.rank === 1 && { color: '#FFD700' }]}>{item.rank === 1 ? '👑' : item.rank}</Text>
            <PlayerBadge name={item.username} color={item.color} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.username}</Text>
              <Dim style={{ fontSize: 12 }}>Nível {item.level}</Dim>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.value}>{formatArea(item.value)}</Text>
              <Dim style={{ fontSize: 12 }}>{(item.share * 100).toFixed(1).replace('.', ',')}% do bairro</Dim>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: theme.surface, borderRadius: 20, marginBottom: 8, ...lift(3) },
  me: { borderColor: theme.accent },
  rank: { color: theme.textDim, fontWeight: '900', fontSize: 20, width: 30, textAlign: 'center' },
  name: { color: theme.text, fontFamily: font.display, fontSize: 16 },
  value: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
