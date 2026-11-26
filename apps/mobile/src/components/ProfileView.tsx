import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Profile } from '../lib/api';
import { formatArea, formatDistance, formatDuration } from '../lib/format';
import { theme } from '../lib/theme';
import { Card, Dim, Stat } from './ui';

export function ProfileView({ userId, footer }: { userId: string; footer?: (p: Profile, reload: () => void) => React.ReactNode }) {
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api
      .profile(userId)
      .then(setP)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);
  useFocusEffect(load);

  if (!p) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />;
  const pct = Math.min(1, p.xpIntoLevel / p.xpForNext);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}>
      <View style={st.header}>
        <View style={[st.avatar, { backgroundColor: p.color }]}>
          <Text style={st.avatarText}>{p.username.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{p.username}</Text>
          <Dim>Nível {p.level} · {p.xp} XP</Dim>
          <View style={st.bar}>
            <View style={[st.barFill, { width: `${pct * 100}%`, backgroundColor: p.color }]} />
          </View>
          <Dim style={{ fontSize: 11, marginTop: 4 }}>{p.xpForNext - p.xpIntoLevel} XP para o nível {p.level + 1}</Dim>
        </View>
      </View>

      <Card>
        <View style={st.row}>
          <Stat label="Território" value={formatArea(p.totals.areaM2)} />
          <Stat label="Distância" value={formatDistance(p.totals.distanceM)} />
        </View>
        <View style={[st.row, { marginTop: 14 }]}>
          <Stat label="Corridas" value={String(p.totals.runs)} />
          <Stat label="Tempo" value={formatDuration(p.totals.movingTimeS)} />
          <Stat label="Ritmo" value={p.totals.pace} />
        </View>
        <View style={[st.row, { marginTop: 14 }]}>
          <Stat label="Conquistas" value={String(p.totals.captures)} />
          <Stat label="Invasões" value={String(p.totals.steals)} />
          <Stat label="Perdas" value={String(p.totals.losses)} />
        </View>
      </Card>

      <Text style={st.h}>Medalhas</Text>
      <View style={st.medals}>
        {p.medals.map((m) => (
          <View key={m.id} style={[st.medal, !m.earned && { opacity: 0.35 }]}>
            <Text style={{ fontSize: 26 }}>{m.earned ? '🏅' : '🔒'}</Text>
            <Text style={st.medalName}>{m.name}</Text>
            <Text style={st.medalDesc}>{m.description}</Text>
          </View>
        ))}
      </View>
      {footer?.(p, load)}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  avatarText: { color: '#000', fontSize: 34, fontWeight: '900' },
  name: { color: theme.text, fontSize: 24, fontWeight: '900' },
  bar: { height: 8, backgroundColor: theme.surfaceAlt, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row' },
  h: { color: theme.text, fontWeight: '800', fontSize: 18 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  medal: { width: '31%', backgroundColor: theme.surface, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  medalName: { color: theme.text, fontWeight: '800', fontSize: 12, marginTop: 4, textAlign: 'center' },
  medalDesc: { color: theme.textDim, fontSize: 10, textAlign: 'center', marginTop: 2 },
});
