// Missões diárias/semanais e desafios entre amigos.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Celebration } from '../../components/Celebration';
import { Button, Card, Dim, Pill, PlayerBadge } from '../../components/ui';
import { api, type Challenge, type ChallengeMetric, type Mission } from '../../lib/api';
import { formatArea, formatDistance } from '../../lib/format';
import { sanitizeLook } from '../../lib/look';
import { useSession } from '../../lib/session';
import { font, lift, theme } from '../../lib/theme';

/** Ícone e cor do cartão de cada tipo de missão. */
const MISSION_ICON: Record<Mission['metric'], [string, string]> = {
  distance_m: ['👟', '#2F80FF'],
  runs: ['🏃', theme.run],
  captures: ['🚩', theme.accent],
  steals: ['⚡', '#FF4F8B'],
  area_m2: ['🧩', '#19C3B1'],
};

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
  const [glyph, color] = MISSION_ICON[m.metric] ?? ['🎯', theme.accent];
  return (
    <View style={[st.mission, m.claimed && { opacity: 0.6 }]}>
      <View style={[st.icon, { backgroundColor: color }]}>
        <Text style={{ fontSize: 22 }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[st.title, m.claimed && { textDecorationLine: 'line-through' }]}>{m.title}</Text>
        <View style={st.bar}>
          <View style={[st.barFill, { width: `${pct * 100}%`, backgroundColor: m.completed ? theme.ok : theme.accent }]} />
        </View>
        <Dim style={{ fontSize: 12, fontFamily: font.bodyBold }}>
          {formatMissionValue(m, m.progress)} / {formatMissionValue(m, m.goal)}
        </Dim>
      </View>
      <View style={st.reward}>
        {m.claimed ? (
          <Text style={st.done}>✓ Resgatado</Text>
        ) : m.completed ? (
          <Pressable style={({ pressed }) => [st.claim, { transform: [{ scale: pressed ? 0.94 : 1 }] }]} onPress={() => onClaim(m)}>
            <Text style={st.claimText}>Resgatar</Text>
            <Text style={st.claimXp}>+{m.xp} XP</Text>
          </Pressable>
        ) : (
          <>
            <View style={st.coin}>
              <Text style={st.coinText}>XP</Text>
            </View>
            <Text style={st.xp}>+{m.xp}</Text>
          </>
        )}
      </View>
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
        <PlayerBadge name={c.rival.username} color={c.rival.color} size={34} />
        <Text style={[st.title, { flex: 1 }]} onPress={() => router.push(`/player/${c.rival.userId}`)}>
          Você × {c.rival.username}
        </Text>
        <Dim style={{ fontSize: 12 }}>
          {METRIC_LABEL[c.metric]} · {c.days} {c.days === 1 ? 'dia' : 'dias'}
        </Dim>
      </View>
      {showScore && (
        <View style={st.score}>
          <Text style={[st.scoreValue, c.me.score >= c.rival.score && { color: theme.run }]}>{formatChallengeScore(c.metric, c.me.score)}</Text>
          <View style={st.vs}>
            <Text style={st.vsText}>×</Text>
          </View>
          <Text style={[st.scoreValue, c.rival.score > c.me.score && { color: theme.danger }]}>{formatChallengeScore(c.metric, c.rival.score)}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row' }}>
        <Pill text={status} tone={c.status === 'active' ? 'info' : c.status === 'pending' ? 'warn' : c.result === 'won' ? 'ok' : 'dim'} />
      </View>
      {c.status === 'pending' && c.role === 'opponent' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Aceitar" onPress={() => onAction(c, 'accept')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Recusar" variant="secondary" onPress={() => onAction(c, 'decline')} />
          </View>
        </View>
      )}
      {c.status === 'pending' && c.role === 'challenger' && <Button title="Cancelar desafio" variant="secondary" onPress={() => onAction(c, 'cancel')} />}
    </Card>
  );
}

export default function Missions() {
  const { user, refreshUser } = useSession();
  const [celebrate, setCelebrate] = useState(0);
  const [gain, setGain] = useState<string | null>(null);
  const float = useState(() => new Animated.Value(0))[0];
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
      setGain(`+${r.xpEarned} XP${user && r.level > user.level ? ` · Nível ${r.level}!` : ''}`);
      setCelebrate((n) => n + 1);
      float.setValue(0);
      Animated.timing(float, { toValue: 1, duration: 1600, useNativeDriver: true }).start(() => setGain(null));
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}>
        <Dim style={{ fontFamily: font.bodyBold }}>Complete, resgate a recompensa e suba de nível.</Dim>
        <View style={st.head}>
          <Text style={st.h}>Hoje</Text>
          {daily[0] && <Dim style={st.small}>renovam em {timeLeft(daily[0].endsAt)}</Dim>}
        </View>
        {daily.map((m) => (
          <MissionRow key={m.id} m={m} onClaim={claim} />
        ))}
        <View style={st.head}>
          <Text style={st.h}>Semana</Text>
          {weekly[0] && <Dim style={st.small}>renovam em {timeLeft(weekly[0].endsAt)}</Dim>}
        </View>
        {weekly.map((m) => (
          <MissionRow key={m.id} m={m} onClaim={claim} />
        ))}

        <View style={[st.head, { marginTop: 6 }]}>
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
      <Celebration effect={sanitizeLook(user?.look).effect} play={celebrate} />
      {gain && (
        <Animated.Text
          pointerEvents="none"
          style={[
            st.float,
            {
              opacity: float.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [20, -60] }) }, { scale: float.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.7, 1.15, 1] }) }],
            },
          ]}
        >
          {gain}
        </Animated.Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  h: { color: theme.text, fontFamily: font.display, fontSize: 20 },
  small: { fontSize: 12, fontFamily: font.bodyBold },
  link: { color: theme.accent, fontFamily: font.display, fontSize: 15 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: theme.surface, borderRadius: theme.radius, borderBottomWidth: 3, borderColor: theme.border, ...lift(5) },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: '#00000022' },
  title: { color: theme.text, fontFamily: font.bodyBold, fontSize: 15 },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 6 },
  reward: { width: 84, alignItems: 'center', gap: 2 },
  coin: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.xp, borderBottomWidth: 3, borderColor: theme.xpDeep, alignItems: 'center', justifyContent: 'center' },
  coinText: { fontFamily: font.display, fontSize: 11, color: '#7A4300' },
  xp: { fontFamily: font.display, fontSize: 14, color: theme.xpDeep },
  claim: { width: 84, backgroundColor: theme.ok, borderRadius: 14, paddingVertical: 7, alignItems: 'center', borderBottomWidth: 3, borderColor: '#13A361', ...lift(4) },
  claimText: { color: '#FFFFFF', fontFamily: font.display, fontSize: 14 },
  claimXp: { color: '#FFFFFF', fontFamily: font.bodyBlack, fontSize: 11 },
  done: { color: theme.ok, fontFamily: font.display, fontSize: 13 },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  scoreValue: { color: theme.text, fontFamily: font.display, fontSize: 24, fontVariant: ['tabular-nums'] },
  vs: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center' },
  vsText: { color: '#FFFFFF', fontFamily: font.display, fontSize: 18 },
  float: { position: 'absolute', alignSelf: 'center', top: '40%', fontFamily: font.display, fontSize: 30, color: theme.xpDeep, textShadowColor: '#FFFFFF', textShadowRadius: 6 },
});
