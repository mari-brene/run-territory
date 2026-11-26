// Tela de corrida em andamento.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TerritoryMap, type TerritoryMapHandle } from '../components/TerritoryMap';
import { Button, Stat } from '../components/ui';
import { formatArea, formatDistance, formatDuration, formatPace, formatSpeed } from '../lib/format';
import { useMapData } from '../lib/mapData';
import { useRun } from '../lib/run';
import { useSession } from '../lib/session';
import { theme } from '../lib/theme';

export default function RunScreen() {
  const { user, settings } = useSession();
  const r = useRun();
  const { territories, live, setViewport } = useMapData(r.territoryVersion);
  const map = useRef<TerritoryMapHandle>(null);
  const [busy, setBusy] = useState(false);

  // segue o corredor no modo simulação (no GPS real a câmera já acompanha)
  useEffect(() => {
    if (settings.simulation && r.position) map.current?.flyTo(r.position.lng, r.position.lat, 16.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.simulation, r.path.length % 8 === 0]);

  useEffect(() => {
    if (!r.run && !busy) router.replace('/map');
  }, [r.run, busy]);

  if (!r.run) return null;
  const paused = r.run.status === 'paused';
  const outside = r.trail.length > 1;

  const finish = () => {
    const doIt = async () => {
      setBusy(true);
      try {
        const summary = await r.finish();
        if (summary) router.replace(`/summary/${summary.id}`);
      } catch (e: any) {
        Alert.alert('Erro', e.message);
      } finally {
        setBusy(false);
      }
    };
    if (outside)
      Alert.alert('Rastro aberto', 'Você está fora do seu território. Se finalizar agora, o rastro atual não vira território.', [
        { text: 'Continuar correndo', style: 'cancel' },
        { text: 'Finalizar mesmo assim', style: 'destructive', onPress: doIt },
      ]);
    else doIt();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TerritoryMap
        ref={map}
        territories={territories}
        live={live}
        myColor={user?.color}
        myTrail={r.trail}
        myPath={r.path}
        position={r.position}
        initialCenter={r.position ? [r.position.lng, r.position.lat] : undefined}
        initialZoom={16.5}
        followUser={!settings.simulation}
        onPress={settings.simulation ? r.simulateTo : undefined}
        onRegionChange={async () => setViewport((await map.current?.visibleBounds()) ?? null)}
      />

      <SafeAreaView edges={['top']} style={st.top} pointerEvents="box-none">
        <View style={[st.status, { backgroundColor: paused ? theme.warning : outside ? user?.color ?? theme.accent : theme.surface }]}>
          <Text style={[st.statusText, (paused || outside) && { color: '#000' }]}>
            {paused ? '⏸ PAUSADO' : outside ? '⚑ EXPANDINDO — volte ao seu território!' : '● NO SEU TERRITÓRIO'}
          </Text>
        </View>
        {r.toasts.map((t) => (
          <View key={t.id} style={[st.toast, t.kind === 'gain' && { borderColor: theme.accent }, t.kind === 'steal' && { borderColor: theme.danger }, t.kind === 'warn' && { borderColor: theme.warning }]}>
            <Text style={st.toastText}>{t.text}</Text>
          </View>
        ))}
        {settings.simulation && <Text style={st.sim}>SIMULAÇÃO: toque no mapa para correr até o ponto</Text>}
      </SafeAreaView>

      <View style={st.panel}>
        <Stat label="Distância" value={formatDistance(r.distanceM)} big />
        <View style={st.row}>
          <Stat label="Tempo" value={formatDuration(settings.simulation ? r.movingTimeS : Math.max(r.elapsedS, r.movingTimeS))} />
          <Stat label="Ritmo /km" value={formatPace(r.distanceM, r.movingTimeS)} />
          <Stat label="Velocidade" value={formatSpeed(r.distanceM, r.movingTimeS)} />
        </View>
        <View style={st.row}>
          <Stat label="Conquistado" value={formatArea(r.areaGainedM2)} />
          <Stat label="Conquistas" value={String(r.captures)} />
        </View>
        {r.error && <Text style={{ color: theme.warning, textAlign: 'center', fontSize: 12 }}>{r.error} — tentando de novo…</Text>}
        <View style={[st.row, { gap: 12, marginTop: 8 }]}>
          {paused ? (
            <Button title="Continuar" onPress={() => r.resume().catch((e) => Alert.alert('Erro', e.message))} style={{ flex: 1 }} />
          ) : (
            <Button title="Pausar" variant="secondary" onPress={() => r.pause().catch((e) => Alert.alert('Erro', e.message))} style={{ flex: 1 }} />
          )}
          <Button title="Finalizar" variant="danger" onPress={finish} loading={busy} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, gap: 8 },
  status: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  statusText: { color: theme.text, fontWeight: '900', letterSpacing: 0.5 },
  toast: { backgroundColor: '#000d', borderRadius: 12, padding: 10, borderLeftWidth: 4, borderColor: theme.info },
  toastText: { color: theme.text, fontWeight: '700' },
  sim: { color: theme.warning, textAlign: 'center', fontWeight: '800', fontSize: 11, backgroundColor: '#000a', padding: 4, borderRadius: 6, overflow: 'hidden' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    gap: 14,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  row: { flexDirection: 'row' },
});
