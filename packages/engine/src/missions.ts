// Missões diárias e semanais — regras puras, compartilhadas entre servidor, app e testes.
// O servidor calcula o progresso a partir das corridas e conquistas do período; aqui ficam
// o catálogo, o sorteio (determinístico por jogador e período) e a conta do progresso.

export type MissionPeriod = 'day' | 'week';
export type MissionMetric = 'distance_m' | 'runs' | 'captures' | 'steals' | 'area_m2';

export interface MissionDef {
  id: string;
  period: MissionPeriod;
  metric: MissionMetric;
  goal: number;
  xp: number;
  title: string;
}

/** Totais do jogador dentro do período (dia ou semana). */
export type PeriodTotals = Record<MissionMetric, number>;

export const MISSION_CATALOG: MissionDef[] = [
  // diárias
  { id: 'd_run_1', period: 'day', metric: 'runs', goal: 1, xp: 30, title: 'Faça uma corrida hoje' },
  { id: 'd_km_2', period: 'day', metric: 'distance_m', goal: 2_000, xp: 40, title: 'Corra 2 km hoje' },
  { id: 'd_km_5', period: 'day', metric: 'distance_m', goal: 5_000, xp: 80, title: 'Corra 5 km hoje' },
  { id: 'd_capture_1', period: 'day', metric: 'captures', goal: 1, xp: 50, title: 'Conquiste uma área hoje' },
  { id: 'd_capture_3', period: 'day', metric: 'captures', goal: 3, xp: 90, title: 'Conquiste 3 áreas hoje' },
  { id: 'd_steal_1', period: 'day', metric: 'steals', goal: 1, xp: 70, title: 'Tome território de um rival hoje' },
  { id: 'd_area_5k', period: 'day', metric: 'area_m2', goal: 5_000, xp: 60, title: 'Ganhe 5.000 m² hoje' },
  // semanais
  { id: 'w_runs_3', period: 'week', metric: 'runs', goal: 3, xp: 150, title: 'Faça 3 corridas na semana' },
  { id: 'w_km_15', period: 'week', metric: 'distance_m', goal: 15_000, xp: 250, title: 'Corra 15 km na semana' },
  { id: 'w_km_30', period: 'week', metric: 'distance_m', goal: 30_000, xp: 450, title: 'Corra 30 km na semana' },
  { id: 'w_capture_10', period: 'week', metric: 'captures', goal: 10, xp: 300, title: 'Conquiste 10 áreas na semana' },
  { id: 'w_steal_5', period: 'week', metric: 'steals', goal: 5, xp: 350, title: 'Tome território 5 vezes na semana' },
  { id: 'w_area_50k', period: 'week', metric: 'area_m2', goal: 50_000, xp: 400, title: 'Ganhe 50.000 m² na semana' },
];

export const MISSIONS_PER_PERIOD: Record<MissionPeriod, number> = { day: 3, week: 2 };

/** Hash FNV-1a de 32 bits: rápido, estável entre plataformas. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Sorteia as missões do jogador para um período. É determinístico: o mesmo jogador vê as mesmas
 * missões o dia (ou a semana) inteiro, sem precisar guardar o sorteio no banco.
 * `periodKey` é a data de início do período, ex.: "2026-11-26".
 */
export function pickMissions(userId: string, period: MissionPeriod, periodKey: string, catalog = MISSION_CATALOG): MissionDef[] {
  const pool = catalog.filter((m) => m.period === period);
  return pool
    .map((m) => ({ m, k: hash(`${userId}|${periodKey}|${m.id}`) }))
    .sort((a, b) => a.k - b.k || a.m.id.localeCompare(b.m.id))
    .slice(0, MISSIONS_PER_PERIOD[period])
    .map((x) => x.m)
    .sort((a, b) => a.xp - b.xp); // da mais fácil para a mais difícil
}

export interface MissionProgress extends MissionDef {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export function missionProgress(def: MissionDef, totals: PeriodTotals, claimed: boolean): MissionProgress {
  const progress = Math.min(totals[def.metric] ?? 0, def.goal);
  return { ...def, progress, completed: progress >= def.goal, claimed };
}

export const findMission = (id: string) => MISSION_CATALOG.find((m) => m.id === id);
