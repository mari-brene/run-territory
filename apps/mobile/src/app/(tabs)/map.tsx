// Mapa principal: o corredor no centro, territórios brilhando, nível e XP sempre à vista.
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TerritoryMap, type TerritoryMapHandle } from '../../components/TerritoryMap';
import { LevelBadge, XpBar } from '../../components/ui';
import { formatArea } from '../../lib/format';
import { sanitizeLook } from '../../lib/look';
import { useMapData } from '../../lib/mapData';
import { useRun } from '../../lib/run';
import { useSession } from '../../lib/session';
import { font, lift, theme } from '../../lib/theme';

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
      map.current?.flyTo(pos.coords.longitude, pos.coords.latitude, 16.5);
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

  const xpFrac = user ? user.xpIntoLevel / user.xpForNext : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TerritoryMap
        ref={map}
        territories={territories}
        live={live}
        myColor={user?.color}
        myLook={sanitizeLook(user?.look)}
        position={here ? { ...here, t: 0 } : null}
        onRegionChange={async () => setViewport((await map.current?.visibleBounds()) ?? null)}
      />

      <SafeAreaView edges={['top']} style={st.top} pointerEvents="box-none">
        <View style={st.topRow} pointerEvents="box-none">
          <Pressable style={st.meChip} onPress={() => router.push('/customize')} accessibilityLabel="Personalizar avatar e conquista">
            <LevelBadge level={user?.level ?? 1} size={46} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={st.name} numberOfLines={1}>
                {user?.username}
              </Text>
              <XpBar fraction={xpFrac} height={9} />
              <Text style={st.xpText}>
                {user ? `${user.xpIntoLevel.toLocaleString('pt-BR')} / ${user.xpForNext.toLocaleString('pt-BR')} XP` : ''}
              </Text>
            </View>
          </Pressable>
          <Pressable style={st.round} onPress={() => router.push('/settings')} accessibilityLabel="Configurações">
            <Text style={{ fontSize: 20, color: theme.text }}>⚙︎</Text>
          </Pressable>
        </View>
        <View style={st.zone}>
          <View style={[st.zoneDot, { backgroundColor: user?.color ?? theme.run }]} />
          <Text style={st.zoneText}>
            Seu território {formatArea(mine?.properties.areaM2 ?? 0)} · {rivals} rivais · {live.length} correndo
          </Text>
        </View>
      </SafeAreaView>

      <View style={st.bottom} pointerEvents="box-none">
        {settings.simulation && <Text style={st.sim}>MODO SIMULAÇÃO · a corrida começa no centro do mapa</Text>}
        {err && <Text style={st.err}>{err}</Text>}
        {!mine && !run.run && <Text style={st.hint}>Sua primeira corrida cria uma base de 30 m no ponto de partida.</Text>}
        <Pressable
          onPress={run.run ? () => router.push('/run') : start}
          disabled={starting}
          style={({ pressed }) => [st.runBtn, run.run && { backgroundColor: theme.accent }, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          accessibilityLabel={run.run ? 'Voltar à corrida' : 'Correr'}
        >
          {starting ? <ActivityIndicator color="#fff" size="large" /> : <Text style={st.runIcon}>{run.run ? '▶' : '👟'}</Text>}
        </Pressable>
        <Text style={st.runLabel}>{run.run ? 'Voltar à corrida' : 'Correr'}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  meChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 999, padding: 5, paddingRight: 18, ...lift(8) },
  name: { fontFamily: font.display, fontSize: 17, color: theme.text },
  xpText: { fontFamily: font.bodyBold, fontSize: 11, color: theme.textDim, fontVariant: ['tabular-nums'] },
  round: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', ...lift(8) },
  zone: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.text + 'E6', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  zoneDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#FFFFFF' },
  zoneText: { color: '#FFFFFF', fontFamily: font.bodyBold, fontSize: 12 },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 6, alignItems: 'center' },
  runBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.run,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...lift(12),
    shadowColor: theme.runDeep,
    shadowOpacity: 0.4,
  },
  runIcon: { fontSize: 38, color: '#FFFFFF' },
  runLabel: { fontFamily: font.display, fontSize: 15, color: theme.text, backgroundColor: '#FFFFFFE6', paddingHorizontal: 14, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' },
  hint: { color: theme.text, textAlign: 'center', fontSize: 12, fontFamily: font.bodyBold, backgroundColor: '#FFFFFFE6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  sim: { color: theme.text, textAlign: 'center', fontFamily: font.bodyBlack, fontSize: 11, backgroundColor: theme.xp, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, overflow: 'hidden' },
  err: { color: '#FFFFFF', textAlign: 'center', fontFamily: font.bodyBold, backgroundColor: theme.danger, padding: 8, borderRadius: 12, overflow: 'hidden' },
});
