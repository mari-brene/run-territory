// Visual: jogo de mapa colorido e de dia. Laranja para correr, violeta para nível, dourado para XP.
export const theme = {
  bg: '#F5F6FF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0FA',
  border: '#E3E6F5',
  text: '#1D2547',
  textDim: '#66708F',
  /** ações principais e destaque de nível */
  accent: '#6C4CF5',
  accentSoft: '#EEE9FF',
  accentText: '#FFFFFF',
  /** botão de correr e tudo que é "conquista" */
  run: '#FF6A2B',
  runDeep: '#E24E12',
  xp: '#FFB81F',
  xpDeep: '#F08A00',
  xpSoft: '#FFF0CC',
  ok: '#1FBF75',
  danger: '#F03E5F',
  warning: '#F5A100',
  info: '#2F80FF',
  shadow: '#1D2547',
  radius: 22,
};

export const font = {
  display: 'Fredoka_700Bold',
  displayMedium: 'Fredoka_600SemiBold',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
  bodyBlack: 'Nunito_900Black',
};

/** Sombra suave usada em cartões e botões flutuantes. */
export const lift = (h = 6) => ({
  shadowColor: theme.shadow,
  shadowOpacity: 0.14,
  shadowRadius: h * 2,
  shadowOffset: { width: 0, height: h / 2 },
  elevation: Math.round(h / 1.5),
});

// Estilo de mapa vetorial gratuito e colorido (OpenStreetMap via OpenFreeMap, sem chave de API).
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
