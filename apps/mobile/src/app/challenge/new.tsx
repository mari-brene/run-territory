// Criar desafio contra um aliado.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, ColorDot, Dim, Segmented } from '../../components/ui';
import { api, type ChallengeMetric, type Friend } from '../../lib/api';
import { theme } from '../../lib/theme';

const DAYS = ['1', '3', '7', '14', '30'] as const;

export default function NewChallenge() {
  const params = useLocalSearchParams<{ opponentId?: string }>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [opponentId, setOpponentId] = useState<string | undefined>(params.opponentId);
  const [metric, setMetric] = useState<ChallengeMetric>('distance');
  const [days, setDays] = useState<(typeof DAYS)[number]>('7');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.friends().then(setFriends).catch(() => {});
  }, []);

  const send = async () => {
    if (!opponentId) return;
    setSending(true);
    try {
      await api.createChallenge(opponentId, metric, Number(days));
      Alert.alert('Desafio enviado!', 'Ele começa quando seu aliado aceitar.');
      router.back();
    } catch (e: any) {
      Alert.alert('Não deu para desafiar', e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card style={{ gap: 8 }}>
        <Text style={st.h}>Quem você quer desafiar?</Text>
        {friends.length === 0 && <Dim>Você ainda não tem aliados. Adicione alguém na aba Amigos.</Dim>}
        {friends.map((f) => (
          <Pressable key={f.id} onPress={() => setOpponentId(f.id)} style={[st.friend, opponentId === f.id && st.on]}>
            <ColorDot color={f.color} size={18} />
            <Text style={st.name}>{f.username}</Text>
            <Dim>Nível {f.level}</Dim>
          </Pressable>
        ))}
      </Card>
      <Card style={{ gap: 10 }}>
        <Text style={st.h}>Quem fizer mais...</Text>
        <Segmented<ChallengeMetric>
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'distance', label: 'Distância' },
            { value: 'area', label: 'Área' },
            { value: 'conquests', label: 'Conquistas' },
          ]}
        />
        <Text style={st.h}>...em quantos dias?</Text>
        <Segmented value={days} onChange={setDays} options={DAYS.map((d) => ({ value: d, label: d }))} />
        <Dim>Vencer dá +150 XP. Empate dá +60 XP para cada um.</Dim>
      </Card>
      <Button title="Enviar desafio" onPress={send} loading={sending} disabled={!opponentId} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { color: theme.text, fontWeight: '800', fontSize: 16 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  on: { borderColor: theme.accent, backgroundColor: theme.surfaceAlt },
  name: { color: theme.text, fontWeight: '700', flex: 1 },
});
