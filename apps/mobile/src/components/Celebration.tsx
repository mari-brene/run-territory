// Efeitos de celebração (confete, chuva de XP, fogos, onda). Toca de novo sempre que `play` muda.
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Celebration as Kind } from '../lib/look';
import { font, theme } from '../lib/theme';

const COLORS = [theme.run, theme.accent, theme.xp, theme.ok, '#19C3B1', '#FF4F8B'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function Celebration({ effect, play }: { effect: Kind; play: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const reduced = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduced.current = v)).catch(() => {});
  }, []);

  // Partículas sorteadas a cada nova celebração.
  const parts = useMemo(() => {
    if (!play) return [];
    if (effect === 'fogos') {
      return [
        [0.25, 0.25, 0],
        [0.72, 0.18, 0.15],
        [0.5, 0.38, 0.3],
        [0.3, 0.5, 0.45],
      ].flatMap(([fx, fy, delay], n) =>
        Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const d = rand(60, 95);
          return { x: fx * W, y: fy * H, dx: Math.cos(a) * d, dy: Math.sin(a) * d, delay, color: COLORS[(n + i) % COLORS.length] };
        }),
      );
    }
    if (effect === 'onda') return [0, 0.15, 0.3].map((delay, i) => ({ x: W / 2, y: H * 0.42, dx: 0, dy: 0, delay, color: [theme.run, theme.xp, theme.accent][i] }));
    const n = effect === 'moedas' ? 28 : 44;
    return Array.from({ length: n }, (_, i) => ({ x: rand(0, W - 20), y: -30, dx: rand(-30, 30), dy: H + 60, delay: rand(0, 0.35), color: COLORS[i % COLORS.length] }));
  }, [play, effect, W, H]);

  useEffect(() => {
    if (!play || reduced.current) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: effect === 'fogos' || effect === 'onda' ? 1600 : 2600, easing: Easing.linear, useNativeDriver: true }).start();
  }, [play, effect, t]);

  if (!play || reduced.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {parts.map((p, i) => {
        // cada partícula usa um trecho [delay, delay + duração] do tempo total
        const span = effect === 'fogos' ? 0.5 : effect === 'onda' ? 0.7 : 0.62;
        const local = t.interpolate({ inputRange: [0, p.delay, Math.min(1, p.delay + span), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
        if (effect === 'onda') {
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: p.x - 40,
                top: p.y - 40,
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 8,
                borderColor: p.color,
                opacity: local.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 0] }),
                transform: [{ scale: local.interpolate({ inputRange: [0, 1], outputRange: [0.2, 7] }) }],
              }}
            />
          );
        }
        if (effect === 'fogos') {
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: p.color,
                opacity: local.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) }, { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) }],
              }}
            />
          );
        }
        const coin = effect === 'moedas';
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: coin ? 24 : 9,
              height: coin ? 24 : 14,
              borderRadius: coin ? 12 : 3,
              backgroundColor: coin ? theme.xp : p.color,
              borderBottomWidth: coin ? 3 : 0,
              borderColor: theme.xpDeep,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [
                { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                { translateX: local.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dx, 0] }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: ['0deg', coin ? '0deg' : '720deg'] }) },
              ],
            }}
          >
            {coin && <Text style={{ fontFamily: font.display, fontSize: 9, color: '#7A4300' }}>XP</Text>}
          </Animated.View>
        );
      })}
    </View>
  );
}
