// Missões diárias/semanais e desafios entre amigos.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ColorDot, Dim } from '../../components/ui';
import { api, type Challenge, type ChallengeMetric, type Mission } from '../../lib/api';
import { formatArea, formatDistance } from '../../lib/format';
import { useSession } from '../../lib/session';
import { theme } from '../../lib/theme';

const METRIC_LABEL: Record<ChallengeMetric, string> = { distance: 'Distância', area: 'Área conquistada', conquests: 'Conquistas' };

export const formatChallengeScore = (metric: ChallengeMetric, v: number) =>
  metric === 'distance' ? formatDistance(v) : metric === 'area' ? formatArea(v) : `${v}`;

function formatMissionValue(m: Mission, v: number) {
  if (m.metric === 'distance_m') return formatDistance(v);
  if (m.metric === 'area_m2') return formatArea(v);
  return String(Math.round(v));
}

function timeLeft(iso: string | null) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'terminando';
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${Math.floor((ms % 3600_000) / 60_000)} min`;
}

function MissionRow({ m, onClaim }: { m: Mission; onClaim: (m: Mission) => void }) {
  const pct = Math.min(1, m.progress / m.goal);
  return (
    <View style={st.mission}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={st.title}>{m.title}</Text>
        <View style={st.bar}>
          <View style={[st.barFill, { width: `${pct * 100}%`, backgroundColor: m.completed ? theme.accent : theme.textDim }]} />
        </View>
        <Dim style={{ fontSize: 12 }}>
          {formatMissionValue(m, m.progress)} de {formatMissionValue(m, m.goal)} · +{m.xp} XP
        </Dim>
      </View>
      {m.claimed ? (
        <Text style={st.done}>✓</Text>
      ) : m.completed ? (
        <Pressable style={st.claim} onPress={() => onClaim(m)}>
          <Text style={st.claimText}>Resgatar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ChallengeCard({ c, onAction }: { c: Challenge; onAction: (c: Challenge, a: 'accept' | 'decline' | 'cancel') => void }) {
  const status =
    c.status === 'pending'
      ? c.role === 'opponent'
        ? `${c.rival.username} desafiou você`
        : `Esperando ${c.rival.username} aceitar`
      : c.status === 'active'
        ? `Termina em ${timeLeft(c.endsAt)}`
        : c.status === 'finished'
          ? c.result === 'won'
            ? 'Você venceu! 🏆'
            : c.result === 'draw'
              ? 'Empate'
              : `${c.rival.username} venceu`
          : c.status === 'declined'
            ? 'Recusado'
            : 'Cancelado';
  const showScore = c.status === 'active' || c.status === 'finished';
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ColorDot color={c.rival.color} />
        <Text style={[st.title, { flex: 1 }]} onPress={() => router.push(`/player/${c.rival.userId}`)}>
          Você × {c.rival.username}
        </Text>
        <Dim style={{ fontSize: 12 }}>
          {METRIC_LABEL[c.metric]} · {c.days} {c.days === 1 ? 'dia' : 'dias'}
        </Dim>
      </View>
      {showScore && (
        <View style={st.score}>
          <Text style={[st.scoreValue, c.me.score >= c.rival.score && { color: theme.accent }]}>{formatChallengeScore(c.metric, c.me.score)}</Text>
          <Dim>×</Dim>
          <Text style={[st.scoreValue, c.rival.score > c.me.score && { color: theme.danger }]}>{formatChallengeScore(c.metric, c.rival.score)}</Text>
        </View>
      )}
      <Dim>{status}</Dim>
      {c.status === 'pending' && c.role === 'opponent' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Aceitar" onPress={() => onAction(c, 'accept')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Recusar" variant="ghost" onPress={() => onAction(c, 'decline')} />
          </View>
        </View>
      )}
      {c.status === 'pending' && c.role === 'challenger' && <Button title="Cancelar desafio" variant="ghost" onPress={() => onAction(c, 'cancel')} />}
    </Card>
  );
}

export default function Missions() {
  const { refreshUser } = useSession();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.missions().then(setMissions), api.challenges().then(setChallenges)])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const claim = async (m: Mission) => {
    try {
      const r = await api.claimMission(m.id);
      setMissions(r.missions);
      refreshUser().catch(() => {});
      Alert.alert('Missão cumprida!', `+${r.xpEarned} XP`);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };
  const act = async (c: Challenge, a: 'accept' | 'decline' | 'cancel') => {
    try {
      await api.challengeAction(c.id, a);
      load();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  const daily = missions.filter((m) => m.period === 'day');
  const weekly = missions.filter((m) => m.period === 'week');
  const open = challenges.filter((c) => c.status === 'pending' || c.status === 'active');
  const past = challenges.filter((c) => c.status !== 'pending' && c.status !== 'active').slice(0, 10);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
    >
      <Card style={{ gap: 4 }}>
        <View style={st.head}>
          <Text style={st.h}>Missões de hoje</Text>
          {daily[0] && <Dim style={{ fontSize: 12 }}>renovam em {timeLeft(daily[0].endsAt)}</Dim>}
        </View>
        {daily.map((m) => (
          <MissionRow key={m.id} m={m} onClaim={claim} />
        ))}
      </Card>
      <Card style={{ gap: 4 }}>
        <View style={st.head}>
          <Text style={st.h}>Missões da semana</Text>
          {weekly[0] && <Dim style={{ fontSize: 12 }}>renovam em {timeLeft(weekly[0].endsAt)}</Dim>}
        </View>
        {weekly.map((m) => (
          <MissionRow key={m.id} m={m} onClaim={claim} />
        ))}
      </Card>

      <View style={st.head}>
        <Text style={st.h}>Desafios</Text>
        <Text style={st.link} onPress={() => router.push('/challenge/new')}>
          + Novo desafio
        </Text>
      </View>
      {open.length === 0 && <Dim>Nenhum desafio aberto. Desafie um aliado para ver quem corre mais!</Dim>}
      {open.map((c) => (
        <ChallengeCard key={c.id} c={c} onAction={act} />
      ))}
      {past.length > 0 && <Text style={[st.h, { marginTop: 6 }]}>Encerrados</Text>}
      {past.map((c) => (
        <ChallengeCard key={c.id} c={c} onAction={act} />
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  h: { color: theme.text, fontWeight: '800', fontSize: 17 },
  link: { color: theme.accent, fontWeight: '800' },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  title: { color: theme.text, fontWeight: '700', fontSize: 15 },
  bar: { height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  claim: { backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  claimText: { color: theme.bg, fontWeight: '900' },
  done: { color: theme.accent, fontWeight: '900', fontSize: 20, width: 30, textAlign: 'center' },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  scoreValue: { color: theme.text, fontWeight: '900', fontSize: 22, fontVariant: ['tabular-nums'] },
});
