// Pontuação, níveis e medalhas — regras compartilhadas entre servidor e app.

export const XP = {
  PER_KM: 100,
  PER_1000_M2: 20,
  PER_STEAL: 50,
};

export function formatPace(distanceM: number, movingTimeS: number): string {
  if (distanceM < 10 || movingTimeS <= 0) return '--:--';
  const secPerKm = movingTimeS / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s === 60 ? 59 : s).padStart(2, '0')}`;
}

export function avgSpeedKmh(distanceM: number, movingTimeS: number): number {
  return movingTimeS > 0 ? distanceM / 1000 / (movingTimeS / 3600) : 0;
}

export function runXp(distanceM: number, gainedM2: number, steals: number): number {
  return Math.round((distanceM / 1000) * XP.PER_KM + (gainedM2 / 1000) * XP.PER_1000_M2 + steals * XP.PER_STEAL);
}

/** Curva quadrática: nível = floor(sqrt(xp/100)) + 1 (nível 2 com 100 XP, nível 3 com 400, ...). */
export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  const cur = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  return { level, xpIntoLevel: xp - cur, xpForNext: next - cur };
}

export interface PlayerTotals {
  totalDistanceM: number;
  runs: number;
  areaM2: number;
  captures: number;
  steals: number;
}

export interface Medal {
  id: string;
  name: string;
  description: string;
  earned: boolean;
}

const MEDALS: { id: string; name: string; description: string; test: (t: PlayerTotals) => boolean }[] = [
  { id: 'first_run', name: 'Primeiro passo', description: 'Complete sua primeira corrida', test: (t) => t.runs >= 1 },
  { id: 'first_capture', name: 'Bandeira fincada', description: 'Conquiste sua primeira área', test: (t) => t.captures >= 1 },
  { id: 'thief', name: 'Invasor', description: 'Tome território de outro jogador', test: (t) => t.steals >= 1 },
  { id: 'km_10', name: '10 km', description: 'Corra 10 km no total', test: (t) => t.totalDistanceM >= 10_000 },
  { id: 'km_100', name: 'Centenário', description: 'Corra 100 km no total', test: (t) => t.totalDistanceM >= 100_000 },
  { id: 'area_10k', name: 'Quarteirão', description: 'Domine 10.000 m²', test: (t) => t.areaM2 >= 10_000 },
  { id: 'area_1km2', name: 'Senhor do bairro', description: 'Domine 1 km²', test: (t) => t.areaM2 >= 1_000_000 },
];

export function medals(t: PlayerTotals): Medal[] {
  return MEDALS.map(({ test, ...m }) => ({ ...m, earned: test(t) }));
}
