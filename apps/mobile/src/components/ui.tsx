// Componentes visuais reutilizáveis: cartões e botões arredondados, barra de XP, selo de nível.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { font, lift, theme } from '../lib/theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flex: 1, backgroundColor: theme.bg }, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Dim({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.dim, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'run' | 'reward' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: theme.accent, run: theme.run, reward: theme.ok, secondary: theme.accentSoft, danger: theme.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' ? theme.accent : variant === 'ghost' ? theme.text : '#FFFFFF';
  const solid = variant !== 'secondary' && variant !== 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        solid && s.btnSolid,
        variant === 'ghost' && s.ghost,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput placeholderTextColor={theme.textDim} autoCapitalize="none" {...props} style={[s.input, props.style]} />
    </View>
  );
}

export function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={[s.statValue, big && { fontSize: 40 }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, value === o.value && s.segActive]}>
          <Text style={[s.segText, value === o.value && { color: theme.accent }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ColorDot({ color, size = 14 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 2, borderColor: '#FFFFFF' }} />;
}

/** Bolinha com a inicial do jogador, na cor dele. */
export function PlayerBadge({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: Math.max(2, size / 14), borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...lift(4) }}>
      <Text style={{ color: '#FFFFFF', fontFamily: font.display, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** Barra de XP dourada. */
export function XpBar({ fraction, height = 10, track = theme.xpSoft }: { fraction: number; height?: number; track?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, height, borderRadius: height / 2, backgroundColor: theme.xp, borderRightWidth: 3, borderColor: theme.xpDeep }} />
    </View>
  );
}

/** Selo redondo com o número do nível. */
export function LevelBadge({ level, size = 46, inverted }: { level: number; size?: number; inverted?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(3, size / 10),
        borderColor: inverted ? '#FFFFFF66' : theme.accent,
        backgroundColor: inverted ? '#FFFFFF22' : theme.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: font.display, fontSize: size * 0.42, color: inverted ? '#FFFFFF' : theme.accent }}>{level}</Text>
    </View>
  );
}

/** Pílula de status (ativo, aguardando...). */
export function Pill({ text, tone = 'dim' }: { text: string; tone?: 'dim' | 'info' | 'warn' | 'ok' }) {
  const c = { dim: [theme.surfaceAlt, theme.textDim], info: ['#E3EEFF', theme.info], warn: ['#FFF1D1', '#A86200'], ok: ['#E1F7EC', '#13804F'] }[tone];
  return <Text style={{ backgroundColor: c[0], color: c[1], fontFamily: font.bodyBlack, fontSize: 11, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, overflow: 'hidden' }}>{text}</Text>;
}

export const s = StyleSheet.create({
  title: { color: theme.text, fontSize: 28, fontFamily: font.display },
  dim: { color: theme.textDim, fontSize: 14, fontFamily: font.body },
  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, borderBottomWidth: 3, borderColor: theme.border, ...lift(6) },
  btn: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  btnSolid: { borderBottomWidth: 4, borderBottomColor: '#00000022' },
  ghost: { borderWidth: 2, borderColor: theme.border },
  btnText: { fontSize: 17, fontFamily: font.display },
  label: { color: theme.textDim, fontSize: 13, marginBottom: 6, fontFamily: font.bodyBold },
  input: { backgroundColor: theme.surface, color: theme.text, borderRadius: 16, borderWidth: 2, borderColor: theme.border, paddingHorizontal: 14, height: 52, fontSize: 16, fontFamily: font.body },
  statValue: { color: theme.text, fontSize: 24, fontFamily: font.display, fontVariant: ['tabular-nums'] },
  statLabel: { color: theme.textDim, fontSize: 11, fontFamily: font.bodyBlack, textTransform: 'uppercase', marginTop: 2, letterSpacing: 0.8 },
  seg: { flexDirection: 'row', backgroundColor: '#E9EBF8', borderRadius: 16, padding: 4 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  segActive: { backgroundColor: theme.surface, ...lift(2) },
  segText: { color: theme.textDim, fontFamily: font.display, fontSize: 14 },
});
