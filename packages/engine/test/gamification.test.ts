import { describe, expect, it } from 'vitest';
import { CHALLENGE_XP, decideChallenge, MISSION_CATALOG, missionProgress, MISSIONS_PER_PERIOD, pickMissions, type PeriodTotals } from '../src';

const zero: PeriodTotals = { distance_m: 0, runs: 0, captures: 0, steals: 0, area_m2: 0 };

describe('missões', () => {
  it('sorteia 3 diárias e 2 semanais, sem repetir, do período certo', () => {
    const d = pickMissions('u1', 'day', '2026-11-26');
    const w = pickMissions('u1', 'week', '2026-11-23');
    expect(d).toHaveLength(MISSIONS_PER_PERIOD.day);
    expect(w).toHaveLength(MISSIONS_PER_PERIOD.week);
    expect(new Set(d.map((m) => m.id)).size).toBe(d.length);
    expect(d.every((m) => m.period === 'day')).toBe(true);
    expect(w.every((m) => m.period === 'week')).toBe(true);
  });

  it('o sorteio é estável no mesmo dia e varia entre dias e jogadores', () => {
    const ids = (u: string, k: string) => pickMissions(u, 'day', k).map((m) => m.id).join();
    expect(ids('u1', '2026-11-26')).toBe(ids('u1', '2026-11-26'));
    const days = new Set(Array.from({ length: 14 }, (_, i) => ids('u1', `2026-12-${String(i + 1).padStart(2, '0')}`)));
    const users = new Set(Array.from({ length: 14 }, (_, i) => ids(`user-${i}`, '2026-11-26')));
    expect(days.size).toBeGreaterThan(1);
    expect(users.size).toBeGreaterThan(1);
  });

  it('calcula progresso limitado à meta', () => {
    const km5 = MISSION_CATALOG.find((m) => m.id === 'd_km_5')!;
    expect(missionProgress(km5, { ...zero, distance_m: 3_200 }, false)).toMatchObject({ progress: 3_200, completed: false });
    expect(missionProgress(km5, { ...zero, distance_m: 7_000 }, true)).toMatchObject({ progress: 5_000, completed: true, claimed: true });
  });

  it('todas as missões têm meta e XP positivos e ids únicos', () => {
    expect(new Set(MISSION_CATALOG.map((m) => m.id)).size).toBe(MISSION_CATALOG.length);
    expect(MISSION_CATALOG.every((m) => m.goal > 0 && m.xp > 0)).toBe(true);
  });
});

describe('desafios', () => {
  it('quem fez mais vence e ganha o XP de vitória', () => {
    const r = decideChallenge('a', 'b', 5_000, 3_000);
    expect(r.winnerId).toBe('a');
    expect(r.xp).toEqual({ a: CHALLENGE_XP.WIN, b: CHALLENGE_XP.PARTICIPATION });
  });

  it('o desafiado também pode vencer; quem não fez nada não ganha XP', () => {
    const r = decideChallenge('a', 'b', 0, 10);
    expect(r.winnerId).toBe('b');
    expect(r.xp).toEqual({ b: CHALLENGE_XP.WIN, a: 0 });
  });

  it('empate', () => {
    expect(decideChallenge('a', 'b', 4, 4)).toEqual({ winnerId: null, xp: { a: CHALLENGE_XP.DRAW, b: CHALLENGE_XP.DRAW } });
    expect(decideChallenge('a', 'b', 0, 0)).toEqual({ winnerId: null, xp: { a: 0, b: 0 } });
  });
});
