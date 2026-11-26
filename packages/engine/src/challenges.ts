// Desafios entre amigos: quem fizer mais no período (distância, área conquistada ou conquistas) vence.

export type ChallengeMetric = 'distance' | 'area' | 'conquests';
export type ChallengeStatus = 'pending' | 'active' | 'declined' | 'cancelled' | 'finished';

export const CHALLENGE_XP = { WIN: 150, DRAW: 60, PARTICIPATION: 20 };
export const CHALLENGE_DAYS = { MIN: 1, MAX: 30 };

export const CHALLENGE_METRIC_LABEL: Record<ChallengeMetric, string> = {
  distance: 'Distância',
  area: 'Área conquistada',
  conquests: 'Conquistas',
};

export interface ChallengeResult {
  winnerId: string | null; // null = empate
  xp: Record<string, number>;
}

/** Decide o resultado de um desafio encerrado. Empate quando a diferença é desprezível. */
export function decideChallenge(challengerId: string, opponentId: string, challengerScore: number, opponentScore: number): ChallengeResult {
  const eps = 1e-6;
  if (Math.abs(challengerScore - opponentScore) <= eps) {
    const xp = challengerScore > eps ? CHALLENGE_XP.DRAW : 0;
    return { winnerId: null, xp: { [challengerId]: xp, [opponentId]: xp } };
  }
  const challengerWins = challengerScore > opponentScore;
  const winnerId = challengerWins ? challengerId : opponentId;
  const loserId = challengerWins ? opponentId : challengerId;
  const loserScore = challengerWins ? opponentScore : challengerScore;
  return { winnerId, xp: { [winnerId]: CHALLENGE_XP.WIN, [loserId]: loserScore > eps ? CHALLENGE_XP.PARTICIPATION : 0 } };
}
