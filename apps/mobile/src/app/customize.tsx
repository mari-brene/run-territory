// Personalizar: monta o avatar do corredor e o estilo de conquista (padrão do território, emblema e celebração).
// Itens com cadeado liberam com nível ou medalha; o servidor confere de novo ao salvar.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Celebration } from '../components/Celebration';
import { Button, Segmented } from '../components/ui';
import { api } from '../lib/api';
import {
  ACCENT_COLORS,
  HAIR_COLORS,
  LOOK_OPTIONS,
  LOOK_PRESETS,
  OUTFIT_COLORS,
  SKIN_TONES,
  isUnlocked,
  lockedChoices,
  requirementLabel,
  sanitizeLook,
  type Look,
  type LookOption,
  type OptionGroup,
  type Progress,
} from '../lib/look';
import { useSession } from '../lib/session';
import { font, lift, theme } from '../lib/theme';

const PATTERN_IMG: Record<string, number> = {
  listras: require('../../assets/map/pattern-listras.png'),
  bolinhas: require('../../assets/map/pattern-bolinhas.png'),
  hexagonos: require('../../assets/map/pattern-hexagonos.png'),
  xadrez: require('../../assets/map/pattern-xadrez.png'),
};
const EMBLEM_IMG: Record<string, number> = {
  estrela: require('../../assets/map/emblem-estrela.png'),
  raio: require('../../assets/map/emblem-raio.png'),
  chama: require('../../assets/map/emblem-chama.png'),
  coroa: require('../../assets/map/emblem-coroa.png'),
};

/** Amostra de território: cor do jogador, padrão por cima e o emblema no meio. */
function TerritorySample({ color, pattern, emblem, initial, size }: { color: string; pattern: string; emblem: string; initial: string; size: number }) {
  return (
    <View style={{ width: size, height: size * 0.72, borderRadius: size * 0.12, borderWidth: 3, borderColor: color, backgroundColor: color + '66', overflow: 'hidden' }}>
      {PATTERN_IMG[pattern] && <ImageBackground source={PATTERN_IMG[pattern]} resizeMode="repeat" style={StyleSheet.absoluteFill} imageStyle={{ opacity: 0.85 }} />}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {EMBLEM_IMG[emblem] ? (
          <Image source={EMBLEM_IMG[emblem]} style={{ width: size * 0.3, height: size * 0.3 }} />
        ) : (
          <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: theme.text, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontFamily: font.display, fontSize: size * 0.14 }}>{initial}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Lock({ text }: { text: string }) {
  return (
    <View style={st.lock}>
      <Text style={st.lockText}>🔒 {text}</Text>
    </View>
  );
}

export default function Customize() {
  const { user, refreshUser } = useSession();
  const saved = useMemo(() => sanitizeLook(user?.look), [user?.look]);
  const [look, setLook] = useState<Look>(saved);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tab, setTab] = useState<'avatar' | 'conq'>('avatar');
  const [play, setPlay] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .profile(user.id)
      .then((p) => setProgress({ level: p.level, medals: p.medals.filter((m) => m.earned).map((m) => m.id) }))
      .catch(() => setProgress({ level: user.level, medals: [] }));
  }, [user]);

  if (!user || !progress) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.bg }} color={theme.accent} />;

  const changed = JSON.stringify(look) !== JSON.stringify(saved);
  const color = user.color;
  const set = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }));

  const save = async () => {
    const locked = lockedChoices(look, progress);
    if (locked.length) {
      Alert.alert('Ainda bloqueado', `${locked[0].option.name} libera com ${requirementLabel(locked[0].option.requires!)}.`);
      return;
    }
    setSaving(true);
    try {
      await api.updateLook(look);
      await refreshUser();
      router.back();
    } catch (e: any) {
      Alert.alert('Não deu para salvar', e.message);
    } finally {
      setSaving(false);
    }
  };

  const swatches = (key: 'skin' | 'hairColor' | 'outfit' | 'accent', list: readonly string[]) => (
    <View style={st.row}>
      {list.map((c) => (
        <Pressable key={c} onPress={() => set({ [key]: c })} accessibilityLabel={`Cor ${c}`} style={[st.swatch, { backgroundColor: c }, look[key] === c && st.swatchOn]} />
      ))}
    </View>
  );

  const options = (group: OptionGroup, render?: (o: LookOption<string>) => React.ReactNode) => (
    <View style={st.row}>
      {(LOOK_OPTIONS[group] as LookOption<string>[]).map((o) => {
        const open = isUnlocked(o.requires, progress);
        const on = look[group] === o.value;
        return (
          <Pressable
            key={o.value}
            disabled={!open}
            onPress={() => {
              set({ [group]: o.value } as Partial<Look>);
              if (group === 'effect') setPlay((n) => n + 1);
            }}
            style={[st.opt, on && st.optOn, !open && st.optLocked]}
          >
            {render?.(o)}
            <Text style={[st.optText, on && { color: theme.accent }, !open && { color: theme.textDim }]}>{o.name}</Text>
            {!open && <Lock text={requirementLabel(o.requires!)} />}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        <View style={st.stage}>
          <TerritorySample color={color} pattern={look.pattern} emblem={look.emblem} initial={user.username.slice(0, 1).toUpperCase()} size={170} />
          <Avatar look={look} size={84} />
          <Pressable style={st.test} onPress={() => setPlay((n) => n + 1)}>
            <Text style={st.testText}>▶ Testar celebração</Text>
          </Pressable>
        </View>

        <Text style={st.h}>Modelos prontos</Text>
        <View style={st.row}>
          {LOOK_PRESETS.map((p) => {
            const locked = lockedChoices(p.look, progress);
            const on = JSON.stringify(p.look) === JSON.stringify(look);
            return (
              <Pressable key={p.id} disabled={locked.length > 0} onPress={() => setLook(p.look)} style={[st.preset, on && st.optOn, locked.length > 0 && st.optLocked]}>
                <View style={locked.length ? { opacity: 0.4 } : undefined}>
                  <Avatar look={p.look} size={40} />
                </View>
                <Text style={st.optText}>{p.name}</Text>
                {locked.length > 0 && <Lock text={requirementLabel(locked[0].option.requires!)} />}
              </Pressable>
            );
          })}
        </View>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'avatar', label: 'Avatar' },
            { value: 'conq', label: 'Conquista' },
          ]}
        />

        {tab === 'avatar' ? (
          <>
            <Text style={st.h}>Pele</Text>
            {swatches('skin', SKIN_TONES)}
            <Text style={st.h}>Cabelo</Text>
            {options('hair')}
            <Text style={st.h}>Cor do cabelo</Text>
            {swatches('hairColor', HAIR_COLORS)}
            <Text style={st.h}>Na cabeça</Text>
            {options('head')}
            <Text style={st.h}>Roupa</Text>
            {swatches('outfit', OUTFIT_COLORS)}
            <Text style={st.h}>Detalhe e acessório</Text>
            {swatches('accent', ACCENT_COLORS)}
          </>
        ) : (
          <>
            <Text style={st.h}>Padrão do território</Text>
            {options('pattern', (o) => (
              <TerritorySample color={color} pattern={o.value} emblem="" initial="" size={54} />
            ))}
            <Text style={st.h}>Emblema do pino</Text>
            {options('emblem', (o) =>
              EMBLEM_IMG[o.value] ? (
                <Image source={EMBLEM_IMG[o.value]} style={{ width: 40, height: 40 }} />
              ) : (
                <View style={st.initial}>
                  <Text style={{ color: '#FFFFFF', fontFamily: font.display, fontSize: 18 }}>{user.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              ),
            )}
            <Text style={st.h}>Celebração ao conquistar</Text>
            {options('effect')}
          </>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={st.footer}>
        <Button title={changed ? 'Salvar visual' : 'Nada mudou ainda'} variant="run" onPress={save} loading={saving} disabled={!changed} />
      </SafeAreaView>
      <Celebration effect={look.effect} play={play} />
    </View>
  );
}

const st = StyleSheet.create({
  stage: { backgroundColor: '#BDE7A0', borderRadius: 26, padding: 16, paddingBottom: 52, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, ...lift(6) },
  test: { position: 'absolute', right: 12, bottom: 10, backgroundColor: theme.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  testText: { fontFamily: font.display, color: theme.accent, fontSize: 13 },
  h: { fontFamily: font.display, fontSize: 17, color: theme.text, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: '#FFFFFF', ...lift(3) },
  swatchOn: { borderColor: theme.accent, transform: [{ scale: 1.1 }] },
  opt: { minWidth: 64, alignItems: 'center', gap: 4, backgroundColor: theme.surface, borderRadius: 16, borderWidth: 2, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 8 },
  optOn: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  optLocked: { backgroundColor: theme.surfaceAlt },
  optText: { fontFamily: font.display, fontSize: 13, color: theme.text },
  preset: { width: '23%', alignItems: 'center', gap: 2, backgroundColor: theme.surface, borderRadius: 18, borderWidth: 2, borderColor: theme.border, paddingVertical: 8 },
  lock: { position: 'absolute', top: -9, right: -6, backgroundColor: theme.text, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
  lockText: { color: '#FFFFFF', fontFamily: font.bodyBlack, fontSize: 9 },
  initial: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.text, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: theme.bg + 'F2' },
});
