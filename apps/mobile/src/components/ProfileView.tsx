import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Medal, type Profile } from '../lib/api';
import { formatArea, formatDistance, formatDuration } from '../lib/format';
import { sanitizeLook } from '../lib/look';
import { font, lift, theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { LevelBadge, XpBar } from './ui';

/** Cor (escura, clara) e símbolo de cada medalha. */
const TIER = { bronze: ['#D07A43', '#F4B488'], silver: ['#8D9BB8', '#D5DDEC'], gold: ['#F08A00', '#FFD45C'], special: ['#6C4CF5', '#B7A4FF'], run: ['#E24E12', '#FF9A5E'] };
const MEDAL_STYLE: Record<string, [keyof typeof TIER, string]> = {
  first_run: ['bronze', '👟'],
  first_capture: ['bronze', '🚩'],
  thief: ['run', '⚡'],
  km_10: ['silver', '10'],
  area_10k: ['silver', '🧩'],
  km_100: ['gold', '100'],
  area_1km2: ['special', '👑'],
};

export function MedalBadge({ medal, size = 54 }: { medal: Medal; size?: number }) {
  const [tier, glyph] = MEDAL_STYLE[medal.id] ?? ['bronze', '★'];
  const [dark, light] = medal.earned ? TIER[tier] : ['#B9BFD3', '#E3E6F0'];
  const d = size * 0.72;
  return (
    <View style={{ width: size, height: size * 1.12, alignItems: 'center' }}>
      <View style={{ position: 'absolute', bottom: 0, flexDirection: 'row', gap: size * 0.08 }}>
        <View style={{ width: size * 0.16, height: size * 0.36, backgroundColor: dark, borderBottomLeftRadius: 3, transform: [{ rotate: '12deg' }] }} />
        <View style={{ width: size * 0.16, height: size * 0.36, backgroundColor: dark, borderBottomRightRadius: 3, transform: [{ rotate: '-12deg' }] }} />
      </View>
      <View style={{ marginTop: size * 0.12, width: d, height: d, borderRadius: d * 0.24, backgroundColor: dark, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: d * 0.8, height: d * 0.8, borderRadius: d * 0.2, backgroundColor: light }} />
      </View>
      <View style={{ position: 'absolute', top: size * 0.12, height: d, width: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: glyph.length > 2 ? size * 0.22 : size * 0.3, fontFamily: font.display, color: medal.earned ? '#FFFFFF' : '#9AA1B8', opacity: medal.earned ? 1 : 0.7, textShadowColor: '#0003', textShadowRadius: 2 }}>
          {medal.earned ? glyph : '🔒'}
        </Text>
      </View>
    </View>
  );
}

export function ProfileView({
  userId,
  footer,
  belowHero,
}: {
  userId: string;
  footer?: (p: Profile, reload: () => void) => React.ReactNode;
  /** algo logo abaixo do cartão de nível (ex.: botão Personalizar no próprio perfil) */
  belowHero?: React.ReactNode;
}) {
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
  const earned = p.medals.filter((m) => m.earned).length;
  const tiles: [string, string, string][] = [
    ['Território', formatArea(p.totals.areaM2), theme.run],
    ['Distância', formatDistance(p.totals.distanceM), '#2F80FF'],
    ['Corridas', String(p.totals.runs), '#19C3B1'],
    ['Conquistas', String(p.totals.captures), theme.accent],
    ['Invasões', String(p.totals.steals), '#FF4F8B'],
    ['Tempo', formatDuration(p.totals.movingTimeS), theme.xpDeep],
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}>
      <View style={st.hero}>
        <LevelBadge level={p.level} size={74} inverted />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={st.name} numberOfLines={1}>
            {p.username}
          </Text>
          <Text style={st.xp}>
            {p.xp.toLocaleString('pt-BR')} XP · faltam {(p.xpForNext - p.xpIntoLevel).toLocaleString('pt-BR')} para o nível {p.level + 1}
          </Text>
          <XpBar fraction={pct} height={12} track="#FFFFFF40" />
        </View>
        <Avatar look={sanitizeLook(p.look)} size={56} />
      </View>
      {belowHero}

      <View style={st.tiles}>
        {tiles.map(([label, value, color]) => (
          <View key={label} style={[st.tile, { backgroundColor: color }]}>
            <Text style={st.tileLabel}>{label}</Text>
            <Text style={st.tileValue} numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Text style={st.pace}>
        Ritmo médio {p.totals.pace} /km · {p.totals.losses} {p.totals.losses === 1 ? 'área perdida' : 'áreas perdidas'}
      </Text>

      <View style={st.head}>
        <Text style={st.h}>Medalhas</Text>
        <Text style={st.count}>
          {earned} de {p.medals.length}
        </Text>
      </View>
      <View style={st.medals}>
        {p.medals.map((m) => (
          <View key={m.id} style={st.medal}>
            <MedalBadge medal={m} />
            <Text style={[st.medalName, !m.earned && { color: theme.textDim }]}>{m.name}</Text>
            <Text style={st.medalDesc}>{m.description}</Text>
          </View>
        ))}
      </View>
      {footer?.(p, load)}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: theme.accent, borderRadius: 26, padding: 16, ...lift(10), shadowColor: theme.accent },
  name: { color: '#FFFFFF', fontSize: 26, fontFamily: font.display },
  xp: { color: '#FFFFFFE6', fontSize: 12, fontFamily: font.bodyBold },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.5%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 4, borderColor: '#00000022' },
  tileLabel: { color: '#FFFFFFE6', fontSize: 11, fontFamily: font.bodyBlack, textTransform: 'uppercase', letterSpacing: 0.8 },
  tileValue: { color: '#FFFFFF', fontSize: 22, fontFamily: font.display, fontVariant: ['tabular-nums'] },
  pace: { color: theme.textDim, fontFamily: font.bodyBold, fontSize: 13, textAlign: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h: { color: theme.text, fontFamily: font.display, fontSize: 20 },
  count: { color: theme.textDim, fontFamily: font.bodyBold, fontSize: 13 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medal: { width: '31.8%', backgroundColor: theme.surface, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', ...lift(4) },
  medalName: { color: theme.text, fontFamily: font.display, fontSize: 13, marginTop: 4, textAlign: 'center' },
  medalDesc: { color: theme.textDim, fontSize: 10, fontFamily: font.body, textAlign: 'center', marginTop: 2 },
});
