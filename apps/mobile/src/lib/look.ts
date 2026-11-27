// Visual do corredor: avatar e estilo de conquista (padrão do território, emblema e celebração).
// Este arquivo é copiado igual em apps/mobile/src/lib/look.ts (o app não importa o engine).
// Um teste do engine confere que as duas cópias continuam iguais.

export const SKIN_TONES = ['#F6D3B3', '#F2BE93', '#C68A5E', '#8D5A3B'] as const;
export const HAIR_COLORS = ['#3A2A5C', '#1F1A17', '#8A4B2A', '#E9C46A', '#FF4F8B'] as const;
export const OUTFIT_COLORS = ['#FF6A2B', '#6C4CF5', '#19C3B1', '#2F80FF', '#FF4F8B', '#1D2547'] as const;
export const ACCENT_COLORS = ['#6C4CF5', '#FF6A2B', '#FFB81F', '#19C3B1', '#FFFFFF', '#1D2547'] as const;

export type HairStyle = 'curto' | 'rabo' | 'cacheado' | 'moicano';
export type Headwear = 'bone' | 'faixa' | 'viseira' | 'nenhum';
export type TerritoryPattern = 'liso' | 'listras' | 'bolinhas' | 'hexagonos' | 'xadrez';
export type Emblem = 'inicial' | 'estrela' | 'raio' | 'chama' | 'coroa';
export type Celebration = 'confete' | 'moedas' | 'fogos' | 'onda';

export interface Look {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  head: Headwear;
  outfit: string;
  accent: string;
  pattern: TerritoryPattern;
  emblem: Emblem;
  effect: Celebration;
}

/** O que libera um item: um nível mínimo ou uma medalha (id de MEDALS em scoring.ts). */
export type Requirement = { level: number } | { medal: string; medalName: string };

export interface LookOption<V extends string> {
  value: V;
  name: string;
  requires?: Requirement;
}

export const LOOK_OPTIONS = {
  hair: [
    { value: 'curto', name: 'Curto' },
    { value: 'rabo', name: 'Rabo de cavalo' },
    { value: 'cacheado', name: 'Cacheado' },
    { value: 'moicano', name: 'Moicano', requires: { level: 6 } },
  ] as LookOption<HairStyle>[],
  head: [
    { value: 'bone', name: 'Boné' },
    { value: 'faixa', name: 'Faixa' },
    { value: 'viseira', name: 'Viseira', requires: { level: 5 } },
    { value: 'nenhum', name: 'Nada' },
  ] as LookOption<Headwear>[],
  pattern: [
    { value: 'liso', name: 'Liso' },
    { value: 'listras', name: 'Listras' },
    { value: 'bolinhas', name: 'Bolinhas', requires: { level: 4 } },
    { value: 'hexagonos', name: 'Hexágonos', requires: { level: 5 } },
    { value: 'xadrez', name: 'Xadrez', requires: { level: 7 } },
  ] as LookOption<TerritoryPattern>[],
  emblem: [
    { value: 'inicial', name: 'Inicial' },
    { value: 'estrela', name: 'Estrela' },
    { value: 'raio', name: 'Raio', requires: { medal: 'thief', medalName: 'Invasor' } },
    { value: 'chama', name: 'Chama', requires: { level: 6 } },
    { value: 'coroa', name: 'Coroa', requires: { medal: 'area_1km2', medalName: 'Senhor do bairro' } },
  ] as LookOption<Emblem>[],
  effect: [
    { value: 'confete', name: 'Confete' },
    { value: 'moedas', name: 'Chuva de XP' },
    { value: 'fogos', name: 'Fogos', requires: { level: 5 } },
    { value: 'onda', name: 'Onda', requires: { level: 6 } },
  ] as LookOption<Celebration>[],
};

export type OptionGroup = keyof typeof LOOK_OPTIONS;
export const OPTION_GROUPS = Object.keys(LOOK_OPTIONS) as OptionGroup[];

export const DEFAULT_LOOK: Look = {
  skin: SKIN_TONES[1],
  hair: 'curto',
  hairColor: HAIR_COLORS[0],
  head: 'bone',
  outfit: OUTFIT_COLORS[0],
  accent: ACCENT_COLORS[0],
  pattern: 'liso',
  emblem: 'inicial',
  effect: 'confete',
};

export const LOOK_PRESETS: { id: string; name: string; look: Look }[] = [
  { id: 'brasa', name: 'Brasa', look: DEFAULT_LOOK },
  {
    id: 'mare',
    name: 'Maré',
    look: { skin: SKIN_TONES[2], hair: 'rabo', hairColor: HAIR_COLORS[1], head: 'faixa', outfit: OUTFIT_COLORS[2], accent: ACCENT_COLORS[4], pattern: 'listras', emblem: 'estrela', effect: 'moedas' },
  },
  {
    id: 'por-do-sol',
    name: 'Pôr do sol',
    look: { skin: SKIN_TONES[3], hair: 'cacheado', hairColor: HAIR_COLORS[2], head: 'nenhum', outfit: OUTFIT_COLORS[4], accent: ACCENT_COLORS[2], pattern: 'bolinhas', emblem: 'estrela', effect: 'confete' },
  },
  {
    id: 'relampago',
    name: 'Relâmpago',
    look: { skin: SKIN_TONES[0], hair: 'curto', hairColor: HAIR_COLORS[3], head: 'viseira', outfit: OUTFIT_COLORS[3], accent: ACCENT_COLORS[5], pattern: 'hexagonos', emblem: 'raio', effect: 'fogos' },
  },
];

const COLOR_CHOICES: Record<'skin' | 'hairColor' | 'outfit' | 'accent', readonly string[]> = {
  skin: SKIN_TONES,
  hairColor: HAIR_COLORS,
  outfit: OUTFIT_COLORS,
  accent: ACCENT_COLORS,
};

/** Aceita qualquer coisa vinda do banco ou da rede e devolve um Look válido (valores desconhecidos viram o padrão). */
export function sanitizeLook(input: unknown): Look {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Look = { ...DEFAULT_LOOK };
  for (const [k, list] of Object.entries(COLOR_CHOICES) as [keyof typeof COLOR_CHOICES, readonly string[]][]) {
    const v = src[k];
    if (typeof v === 'string' && list.includes(v.toUpperCase())) out[k] = v.toUpperCase();
  }
  for (const g of OPTION_GROUPS) {
    const v = src[g];
    if ((LOOK_OPTIONS[g] as LookOption<string>[]).some((o) => o.value === v)) (out as unknown as Record<string, unknown>)[g] = v;
  }
  return out;
}

export interface Progress {
  level: number;
  /** ids das medalhas já ganhas */
  medals: string[];
}

export function isUnlocked(req: Requirement | undefined, p: Progress): boolean {
  if (!req) return true;
  return 'level' in req ? p.level >= req.level : p.medals.includes(req.medal);
}

export function requirementLabel(req: Requirement): string {
  return 'level' in req ? `Nível ${req.level}` : `Medalha ${req.medalName}`;
}

export function findOption(group: OptionGroup, value: string): LookOption<string> | undefined {
  return (LOOK_OPTIONS[group] as LookOption<string>[]).find((o) => o.value === value);
}

/** Itens do visual que o jogador escolheu mas ainda não liberou. */
export function lockedChoices(look: Look, p: Progress): { group: OptionGroup; option: LookOption<string> }[] {
  return OPTION_GROUPS.map((group) => ({ group, option: findOption(group, look[group])! })).filter(({ option }) => !isUnlocked(option.requires, p));
}

/** Nomes dos itens com requisito que estão liberados para este progresso (para avisar o que é novo). */
export function unlockedItemNames(p: Progress): string[] {
  return OPTION_GROUPS.flatMap((g) => (LOOK_OPTIONS[g] as LookOption<string>[]).filter((o) => o.requires && isUnlocked(o.requires, p)).map((o) => o.name));
}
