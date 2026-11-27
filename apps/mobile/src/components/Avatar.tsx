// Avatar do corredor desenhado só com Views (sem imagens), a partir do Look escolhido.
// As medidas seguem uma grade de 64 x 84 e são escaladas pelo tamanho pedido.
import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';
import type { Look } from '../lib/look';

const NAVY = '#1D2547';

export function Avatar({ look, size = 64, running }: { look: Look; size?: number; running?: boolean }) {
  const k = size / 64;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 160, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 160, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, bob]);

  /** Retângulo arredondado na grade 64x84. */
  const box = (x: number, y: number, w: number, h: number, bg: string, r = 0, extra: ViewStyle = {}) => ({
    position: 'absolute' as const,
    left: x * k,
    top: y * k,
    width: w * k,
    height: h * k,
    borderRadius: r * k,
    backgroundColor: bg,
    ...extra,
  });
  const circle = (cx: number, cy: number, r: number, bg: string) => box(cx - r, cy - r, r * 2, r * 2, bg, r);
  const stripe = look.accent === look.outfit ? '#FFFFFF' : look.accent;
  const topRound = (r: number): ViewStyle => ({ borderTopLeftRadius: r * k, borderTopRightRadius: r * k });

  return (
    <View style={{ width: size, height: (84 / 64) * size }} pointerEvents="none">
      <View style={box(17, 76, 30, 8, '#1D254733', 15)} />
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4 * k] }) }] }}>
        {/* pernas e tênis */}
        <View style={box(22, 56, 8, 20, NAVY, 4)} />
        <View style={box(34, 56, 8, 20, NAVY, 4)} />
        <View style={box(18, 72, 14, 8, '#FFFFFF', 4, { borderWidth: 2 * k, borderColor: NAVY })} />
        <View style={box(32, 72, 14, 8, '#FFFFFF', 4, { borderWidth: 2 * k, borderColor: NAVY })} />
        {/* braços */}
        <View style={box(13, 38, 7, 16, look.skin, 3.5, { transform: [{ rotate: '18deg' }] })} />
        <View style={box(44, 38, 7, 16, look.skin, 3.5, { transform: [{ rotate: '-18deg' }] })} />
        {/* corpo */}
        <View style={box(18, 34, 28, 26, look.outfit, 11)} />
        <View style={box(22, 44.5, 20, 3, stripe, 1.5)} />
        {/* rabo de cavalo fica atrás da cabeça */}
        {look.hair === 'rabo' && <View style={box(41.5, 20, 11, 20, look.hairColor, 5.5, { transform: [{ rotate: '-20deg' }] })} />}
        {/* cabeça */}
        <View style={circle(32, 22, 14, look.skin)} />
        {/* cabelo */}
        {(look.hair === 'curto' || look.hair === 'rabo') && <View style={box(18, 8, 28, 12, look.hairColor, 0, topRound(14))} />}
        {look.hair === 'cacheado' &&
          [
            [20, 15, 6],
            [26, 10, 6],
            [33, 8, 6.5],
            [40, 10, 6],
            [45, 15, 6],
            [18.5, 21, 4],
            [45.5, 21, 4],
          ].map(([x, y, r], i) => <View key={i} style={circle(x, y, r, look.hairColor)} />)}
        {look.hair === 'moicano' && (
          <>
            <View style={box(19, 9, 26, 9, look.hairColor, 0, { ...topRound(13), opacity: 0.55 })} />
            <View style={box(28, 0, 8, 18, look.hairColor, 4)} />
          </>
        )}
        {/* o que vai na cabeça */}
        {look.head === 'bone' && (
          <>
            <View style={box(17, 6, 30, 11, look.accent, 0, topRound(15))} />
            <View style={box(38, 14, 15, 4, look.accent, 2)} />
          </>
        )}
        {look.head === 'faixa' && (
          <>
            <View style={box(18, 12, 28, 5, look.accent, 2.5)} />
            <View style={box(44, 9, 8, 5, look.accent, 2, { transform: [{ rotate: '-25deg' }] })} />
          </>
        )}
        {look.head === 'viseira' && (
          <>
            <View style={box(18, 13, 28, 4, look.accent, 2)} />
            <View style={box(30, 14, 23, 4, look.accent, 2)} />
          </>
        )}
        {/* rosto */}
        <View style={circle(27, 24, 2, NAVY)} />
        <View style={circle(37, 24, 2, NAVY)} />
        <View style={box(28, 27, 8, 4, 'transparent', 0, { borderBottomWidth: 2 * k, borderColor: NAVY, borderBottomLeftRadius: 4 * k, borderBottomRightRadius: 4 * k })} />
        <View style={circle(23, 28, 2.4, '#FF8F8F99')} />
        <View style={circle(41, 28, 2.4, '#FF8F8F99')} />
      </Animated.View>
    </View>
  );
}
