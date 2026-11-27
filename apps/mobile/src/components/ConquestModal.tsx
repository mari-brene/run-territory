// Tela de conquista ao terminar a corrida: área ganha, XP subindo, nível novo e o que foi liberado.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import type { RunSummary } from '../lib/api';
import { formatArea } from '../lib/format';
import type { Look } from '../lib/look';
import { font, lift, theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { Celebration } from './Celebration';
import { Button } from './ui';

export function ConquestModal({
  summary,
  look,
  levelUp,
  unlocked,
  onClose,
  onCustomize,
}: {
  summary: RunSummary;
  look: Look;
  /** novo nível, quando a corrida fez subir */
  levelUp: number | null;
  unlocked: string[];
  onClose: () => void;
  onCustomize: () => void;
}) {
  const conquered = summary.areaGainedM2 > 0;
  const [shown, setShown] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    const t0 = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - t0) / 1000);
      setShown(Math.round(summary.xpEarned * (1 - (1 - t) ** 3)));
      if (t >= 1) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [pop, summary.xpEarned]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <Animated.View style={[st.card, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: pop }]}>
          <View style={[st.head, !conquered && { backgroundColor: theme.accent }]}>
            <Avatar look={look} size={58} />
            <Text style={st.title}>{conquered ? 'Território conquistado!' : 'Corrida concluída!'}</Text>
          </View>
          <View style={st.body}>
            {conquered && (
              <View style={st.gain}>
                <Text style={st.gainLabel}>Área nova</Text>
                <Text style={st.gainValue}>+{formatArea(summary.areaGainedM2)}</Text>
              </View>
            )}
            {summary.steals.map((s, i) => (
              <View key={i} style={st.gain}>
                <Text style={st.gainLabel}>Tomado de {s.victim}</Text>
                <Text style={[st.gainValue, { color: theme.run }]}>{formatArea(s.areaM2)}</Text>
              </View>
            ))}
            <Text style={st.xp}>+{shown.toLocaleString('pt-BR')} XP</Text>
            {levelUp && (
              <View style={st.level}>
                <Text style={st.levelText}>★ Subiu para o nível {levelUp}!</Text>
              </View>
            )}
            {unlocked.length > 0 && (
              <View style={st.unlocks}>
                <Text style={st.unlocksLabel}>DESBLOQUEADO PARA PERSONALIZAR</Text>
                <Text style={st.unlocksText}>{unlocked.join(' · ')}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {unlocked.length > 0 && <Button title="Personalizar" variant="secondary" onPress={onCustomize} style={{ flex: 1, paddingHorizontal: 8 }} />}
              <Button title="Continuar" onPress={onClose} style={{ flex: 1 }} />
            </View>
          </View>
        </Animated.View>
        <Celebration effect={look.effect} play={1} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#1D254780', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: theme.surface, borderRadius: 30, overflow: 'hidden', ...lift(20) },
  head: { backgroundColor: theme.run, alignItems: 'center', paddingTop: 18, paddingBottom: 16, gap: 6 },
  title: { color: '#FFFFFF', fontFamily: font.display, fontSize: 26, textAlign: 'center' },
  body: { padding: 18, gap: 10, alignItems: 'stretch' },
  gain: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  gainLabel: { fontFamily: font.bodyBold, color: theme.text },
  gainValue: { fontFamily: font.display, color: theme.text, fontVariant: ['tabular-nums'] },
  xp: { fontFamily: font.display, fontSize: 42, color: theme.xpDeep, textAlign: 'center', fontVariant: ['tabular-nums'] },
  level: { alignSelf: 'center', backgroundColor: theme.accent, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6 },
  levelText: { color: '#FFFFFF', fontFamily: font.display, fontSize: 16 },
  unlocks: { backgroundColor: '#E6F9EF', borderRadius: 16, padding: 10 },
  unlocksLabel: { color: '#13804F', fontFamily: font.bodyBlack, fontSize: 11, letterSpacing: 0.8 },
  unlocksText: { color: theme.text, fontFamily: font.bodyBold, marginTop: 2 },
});
