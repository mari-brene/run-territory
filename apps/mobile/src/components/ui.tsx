// Componentes visuais reutilizáveis.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: theme.accent, secondary: theme.surfaceAlt, danger: theme.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' ? theme.accentText : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, variant === 'ghost' && s.ghost, style]}
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
          <Text style={[s.segText, value === o.value && { color: theme.accentText }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ColorDot({ color, size = 14 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 2, borderColor: '#0006' }} />;
}

export const s = StyleSheet.create({
  title: { color: theme.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  dim: { color: theme.textDim, fontSize: 14 },
  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, borderWidth: 1, borderColor: theme.border },
  btn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  ghost: { borderWidth: 1, borderColor: theme.border },
  btnText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  label: { color: theme.textDim, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: theme.surface, color: theme.text, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, height: 50, fontSize: 16 },
  statValue: { color: theme.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 2, letterSpacing: 0.8 },
  seg: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.border },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: theme.accent },
  segText: { color: theme.textDim, fontWeight: '700', fontSize: 13 },
});
