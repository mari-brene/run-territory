// Mapa principal com territórios — elemento central do app.
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TerritoryMap, type TerritoryMapHandle } from '../../components/TerritoryMap';
import { Button, ColorDot } from '../../components/ui';
import { formatArea } from '../../lib/format';
import { useMapData } from '../../lib/mapData';
import { useRun } from '../../lib/run';
import { useSession } from '../../lib/session';
import { theme } from '../../lib/theme';

export default function MapScreen() {
  const { user, settings } = useSession();
  const run = useRun();
  const { territories, live, setViewport } = useMapData(run.territoryVersion);
  const map = useRef<TerritoryMapHandle>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.current?.flyTo(pos.coords.longitude, pos.coords.latitude, 15.5);
    })().catch(() => {});
  }, []);

  const mine = territories?.features.find((f) => f.properties.relation === 'me');
  const rivals = new Set(territories?.features.filter((f) => f.properties.relation !== 'me').map((f) => f.properties.userId)).size;

  const start = async () => {
    setStarting(true);
    setErr(null);
    try {
      let fallback = here;
      if (settings.simulation) {
        const b = await map.current?.visibleBounds();
        if (b) fallback = { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
      }
      await run.start(fallback ?? undefined);
      router.push('/run');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TerritoryMap
        ref={map}
        territories={territories}
        live={live}
        myColor={user?.color}
        position={here ? { ...here, t: 0 } : null}
        onRegionChange={async () => setViewport((await map.current?.visibleBounds()) ?? null)}
      />
      <SafeAreaView edges={['top']} style={st.top} pointerEvents="box-none">
        <View style={st.chip}>
          {user && <ColorDot color={user.color} />}
          <Text style={st.chipText}>{user?.username}</Text>
          <Text style={st.chipDim}>Nv {user?.level}</Text>
          <View style={st.sep} />
          <Text style={st.chipText}>{formatArea(mine?.properties.areaM2 ?? 0)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={st.chip}>
            <Text style={st.chipDim}>{rivals} jogadores · {live.length} correndo</Text>
          </View>
          <Pressable style={st.chip} onPress={() => router.push('/settings')}>
            <Text style={st.chipText}>⚙︎</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={st.bottom} pointerEvents="box-none">
        {settings.simulation && <Text style={st.sim}>MODO SIMULAÇÃO · a corrida começa no centro do mapa</Text>}
        {err && <Text style={st.err}>{err}</Text>}
        {run.run ? (
          <Button title="Voltar à corrida" onPress={() => router.push('/run')} />
        ) : (
          <Button title="▶  Correr" onPress={start} loading={starting} style={{ height: 64, borderRadius: 32 }} />
        )}
        {!mine && <Text style={st.hint}>Sua primeira corrida cria uma base de 30 m no ponto de partida.</Text>}
      </View>

      <View style={st.legend} pointerEvents="none">
        <Text style={st.legendText}>━ você/rivais   ┅ aliados</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, gap: 8, alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface + 'EE',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipText: { color: theme.text, fontWeight: '800' },
  chipDim: { color: theme.textDim, fontWeight: '600', fontSize: 12 },
  sep: { width: 1, height: 14, backgroundColor: theme.border },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 8 },
  hint: { color: theme.text, textAlign: 'center', fontSize: 12, backgroundColor: '#000a', padding: 6, borderRadius: 8, overflow: 'hidden' },
  sim: { color: theme.warning, textAlign: 'center', fontWeight: '800', fontSize: 11 },
  err: { color: theme.danger, textAlign: 'center', fontWeight: '700', backgroundColor: '#000c', padding: 6, borderRadius: 8, overflow: 'hidden' },
  legend: { position: 'absolute', right: 12, bottom: 110 },
  legendText: { color: theme.textDim, fontSize: 10, backgroundColor: '#000a', padding: 4, borderRadius: 6, overflow: 'hidden' },
});
