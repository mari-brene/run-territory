// Resumo da corrida e das conquistas.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConquestModal } from '../../components/ConquestModal';
import { TerritoryMap, type TerritoryMapHandle } from '../../components/TerritoryMap';
import { Button, Card, Dim, Stat } from '../../components/ui';
import { api, type RunSummary } from '../../lib/api';
import { formatArea, formatDate, formatDistance, formatDuration } from '../../lib/format';
import { useSession } from '../../lib/session';
import { sanitizeLook, unlockedItemNames } from '../../lib/look';
import { font, theme } from '../../lib/theme';

const KIND: Record<string, string> = { base: 'Base inicial', capture: 'Área fechada', loop_capture: 'Laço fechado' };

export default function Summary() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { user, refreshUser } = useSession();
  const [s, setS] = useState<RunSummary | null>(null);
  const map = useRef<TerritoryMapHandle>(null);
  // Nível de antes da corrida: a sessão ainda não foi atualizada quando a tela abre.
  const levelBefore = useRef(user?.level ?? 1).current;
  const [celebration, setCelebration] = useState<{ levelUp: number | null; unlocked: string[] } | null>(null);

  useEffect(() => {
    api.run(id).then(setS).catch(() => {});
    refreshUser().catch(() => {});
    if (fresh && user)
      api
        .profile(user.id)
        .then((p) => {
          const medals = p.medals.filter((m) => m.earned).map((m) => m.id);
          const before = new Set(unlockedItemNames({ level: levelBefore, medals }));
          setCelebration({
            levelUp: p.level > levelBefore ? p.level : null,
            unlocked: unlockedItemNames({ level: p.level, medals }).filter((n) => !before.has(n)),
          });
        })
        .catch(() => setCelebration({ levelUp: null, unlocked: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!s || s.path.length < 2) return;
    const xs = s.path.map((p) => p[0]);
    const ys = s.path.map((p) => p[1]);
    setTimeout(() => map.current?.fitBounds([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]), 400);
  }, [s]);

  if (!s) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.bg }} color={theme.accent} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ height: 300 }}>
        <TerritoryMap
          ref={map}
          myColor={user?.color}
          myPath={s.path}
          highlight={[...s.conquests.map((c) => c.geom), ...s.steals.map((c) => c.geom)]}
          initialCenter={s.path[0]}
          pitch={0}
        />
      </View>
      <View style={{ padding: 16, gap: 14 }}>
        <Dim>{formatDate(s.startedAt)}</Dim>
        <Card>
          <View style={st.row}>
            <Stat label="Distância" value={formatDistance(s.distanceM)} />
            <Stat label="Tempo" value={formatDuration(s.movingTimeS)} />
          </View>
          <View style={[st.row, { marginTop: 14 }]}>
            <Stat label="Ritmo /km" value={s.pace} />
            <Stat label="Vel. média" value={`${s.avgSpeedKmh.toFixed(1).replace('.', ',')} km/h`} />
          </View>
        </Card>

        <Card style={{ borderColor: theme.xp, borderBottomWidth: 4 }}>
          <Text style={st.h}>Conquistas</Text>
          <View style={st.row}>
            <Stat label="Área ganha" value={formatArea(s.areaGainedM2)} />
            <Stat label="Tomada de rivais" value={formatArea(s.areaStolenM2)} />
            <Stat label="XP" value={`+${s.xpEarned}`} />
          </View>
          {s.conquests.length === 0 && <Dim style={{ marginTop: 12 }}>Nenhuma área fechada. Saia do território e volte para ele para conquistar!</Dim>}
          {s.conquests.map((c, i) => (
            <Text key={i} style={st.item}>
              ⬢ {KIND[c.kind] ?? c.kind}: {formatArea(c.areaM2)}
            </Text>
          ))}
          {s.steals.map((c, i) => (
            <Text key={`s${i}`} style={[st.item, { color: theme.danger }]}>
              ⚔ Tomou {formatArea(c.areaM2)} de {c.victim}
            </Text>
          ))}
        </Card>
        <Button title="Voltar ao mapa" variant="run" onPress={() => router.replace('/map')} />
      </View>
      {celebration && (
        <ConquestModal
          summary={s}
          look={sanitizeLook(user?.look)}
          levelUp={celebration.levelUp}
          unlocked={celebration.unlocked}
          onClose={() => setCelebration(null)}
          onCustomize={() => {
            setCelebration(null);
            router.push('/customize');
          }}
        />
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row' },
  h: { color: theme.text, fontFamily: font.display, fontSize: 18, marginBottom: 12 },
  item: { color: theme.text, marginTop: 8, fontFamily: font.bodyBold },
});
