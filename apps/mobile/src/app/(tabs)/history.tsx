// Histórico de atividades e de conquistas/perdas.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Dim, Screen, Segmented } from '../../components/ui';
import { api, type ConquestLog, type Run } from '../../lib/api';
import { formatArea, formatDate, formatDistance, formatDuration } from '../../lib/format';
import { theme } from '../../lib/theme';

export default function History() {
  const [tab, setTab] = useState<'runs' | 'events'>('runs');
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<ConquestLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.runs().then(setRuns), api.events().then(setEvents)])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const refresh = <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />;

  return (
    <Screen style={{ padding: 16, gap: 12 }}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'runs', label: 'Corridas' }, { value: 'events', label: 'Conquistas e perdas' }]} />
      {tab === 'runs' ? (
        <FlatList
          data={runs}
          keyExtractor={(r) => r.id}
          refreshControl={refresh}
          ListEmptyComponent={<Dim style={{ textAlign: 'center', marginTop: 30 }}>Nenhuma corrida ainda. Bora conquistar o bairro!</Dim>}
          renderItem={({ item }) => (
            <Pressable style={st.card} onPress={() => router.push(`/summary/${item.id}`)}>
              <Dim style={{ fontSize: 12 }}>{formatDate(item.startedAt)}</Dim>
              <View style={st.line}>
                <Text style={st.big}>{formatDistance(item.distanceM)}</Text>
                <Text style={st.mid}>{formatDuration(item.movingTimeS)}</Text>
                <Text style={st.mid}>{item.pace}/km</Text>
              </View>
              <Text style={{ color: item.areaGainedM2 > 0 ? theme.accent : theme.textDim, fontWeight: '700' }}>
                ⬢ +{formatArea(item.areaGainedM2)}
                {item.areaStolenM2 > 0 ? `  ⚔ ${formatArea(item.areaStolenM2)} de rivais` : ''}  · +{item.xpEarned} XP
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => String(e.id)}
          refreshControl={refresh}
          ListEmptyComponent={<Dim style={{ textAlign: 'center', marginTop: 30 }}>Nada por aqui ainda.</Dim>}
          renderItem={({ item }) => {
            const loss = item.direction === 'loss';
            const text = loss
              ? `${item.byUsername} tomou ${formatArea(item.areaM2)} de você`
              : item.kind === 'steal'
                ? `Você tomou ${formatArea(item.areaM2)} de ${item.victimUsername}`
                : item.kind === 'base'
                  ? `Base criada: ${formatArea(item.areaM2)}`
                  : `Área conquistada: ${formatArea(item.areaM2)}`;
            return (
              <View style={[st.card, { borderLeftWidth: 4, borderLeftColor: loss ? theme.danger : item.kind === 'steal' ? theme.warning : theme.accent }]}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>{text}</Text>
                <Dim style={{ fontSize: 12 }}>{formatDate(item.createdAt)}</Dim>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8, gap: 6, borderWidth: 1, borderColor: theme.border },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  big: { color: theme.text, fontSize: 22, fontWeight: '900' },
  mid: { color: theme.textDim, fontWeight: '700' },
});
