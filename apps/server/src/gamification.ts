// Missões diárias e semanais, desafios entre amigos e disputas por bairro/região.
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import {
  CHALLENGE_DAYS,
  decideChallenge,
  findMission,
  levelFromXp,
  missionProgress,
  pickMissions,
  type ChallengeMetric,
  type MissionPeriod,
  type PeriodTotals,
} from '@run-territory/engine';
import { config } from './config';
import { withTx, type Db, type Tx } from './db';
import type { Hub } from './realtime';
import { HttpError } from './runService';

type Q = Db | Tx;

// ---------- períodos (no fuso do jogo) ----------
export interface PeriodBounds {
  start: Date;
  end: Date;
  key: string; // data local de início, ex.: 2026-11-26
}

/** Início e fim do dia/semana/mês atual no fuso configurado (semana começa na segunda). */
export async function periodBounds(db: Q, period: 'day' | 'week' | 'month'): Promise<PeriodBounds> {
  const { rows } = await db.query(
    `SELECT (date_trunc($1, now() AT TIME ZONE $2) AT TIME ZONE $2) AS start,
            ((date_trunc($1, now() AT TIME ZONE $2) + ('1 ' || $1)::interval) AT TIME ZONE $2) AS "end",
            to_char(date_trunc($1, now() AT TIME ZONE $2), 'YYYY-MM-DD') AS key`,
    [period, config.timezone],
  );
  return rows[0];
}

/** SQL do início do período, para usar dentro de outras consultas. `$tz` é o parâmetro do fuso. */
export const periodStartSql = (period: 'week' | 'month', tzParam: string) =>
  `(date_trunc('${period}', now() AT TIME ZONE ${tzParam}) AT TIME ZONE ${tzParam})`;

/** Totais do jogador num intervalo de tempo: base das missões e dos desafios. */
export async function periodTotals(db: Q, userId: string, from: Date, to: Date): Promise<PeriodTotals> {
  const { rows } = await db.query(
    `SELECT
       coalesce((SELECT sum(distance_m) FROM runs WHERE user_id = $1 AND started_at >= $2 AND started_at < $3), 0)::float8 AS distance_m,
       (SELECT count(*) FROM runs WHERE user_id = $1 AND status = 'finished' AND started_at >= $2 AND started_at < $3)::int AS runs,
       (SELECT count(*) FROM conquest_events WHERE user_id = $1 AND kind IN ('capture', 'loop_capture') AND created_at >= $2 AND created_at < $3)::int AS captures,
       (SELECT count(*) FROM conquest_events WHERE user_id = $1 AND kind = 'steal' AND created_at >= $2 AND created_at < $3)::int AS steals,
       coalesce((SELECT sum(area_m2) FROM conquest_events WHERE user_id = $1 AND kind <> 'steal' AND created_at >= $2 AND created_at < $3), 0)::float8 AS area_m2`,
    [userId, from, to],
  );
  return rows[0];
}

const challengeScore = (t: PeriodTotals, metric: ChallengeMetric) =>
  metric === 'distance' ? t.distance_m : metric === 'area' ? t.area_m2 : t.captures + t.steals;

// ---------- missões ----------
async function missionsFor(db: Q, userId: string) {
  const out = [];
  for (const period of ['day', 'week'] as MissionPeriod[]) {
    const b = await periodBounds(db, period);
    const totals = await periodTotals(db, userId, b.start, b.end);
    const { rows } = await db.query('SELECT mission_id FROM mission_claims WHERE user_id = $1 AND period_start = $2', [userId, b.key]);
    const claimed = new Set(rows.map((r) => r.mission_id));
    for (const m of pickMissions(userId, period, b.key))
      out.push({ ...missionProgress(m, totals, claimed.has(m.id)), periodStart: b.key, endsAt: b.end });
  }
  return out;
}

// ---------- desafios ----------
const PENDING_EXPIRES_DAYS = 7;

/** Encerra desafios vencidos do jogador (dá o XP uma vez só) e cancela convites velhos. */
export async function settleChallenges(db: Db, userId: string) {
  await db.query(
    `UPDATE challenges SET status = 'cancelled'
     WHERE status = 'pending' AND created_at < now() - make_interval(days => $2) AND (challenger_id = $1 OR opponent_id = $1)`,
    [userId, PENDING_EXPIRES_DAYS],
  );
  const { rows: due } = await db.query(
    `SELECT id FROM challenges WHERE status = 'active' AND ends_at <= now() AND (challenger_id = $1 OR opponent_id = $1)`,
    [userId],
  );
  for (const { id } of due) {
    await withTx(db, async (tx) => {
      // SKIP LOCKED: se o outro jogador estiver encerrando o mesmo desafio agora, deixa com ele.
      const { rows } = await tx.query(`SELECT * FROM challenges WHERE id = $1 AND status = 'active' FOR UPDATE SKIP LOCKED`, [id]);
      const c = rows[0];
      if (!c) return;
      const cs = challengeScore(await periodTotals(tx, c.challenger_id, c.starts_at, c.ends_at), c.metric);
      const os = challengeScore(await periodTotals(tx, c.opponent_id, c.starts_at, c.ends_at), c.metric);
      const result = decideChallenge(c.challenger_id, c.opponent_id, cs, os);
      await tx.query(
        `UPDATE challenges SET status = 'finished', challenger_score = $2, opponent_score = $3, winner_id = $4 WHERE id = $1`,
        [id, cs, os, result.winnerId],
      );
      for (const [uid, xp] of Object.entries(result.xp)) if (xp > 0) await tx.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [uid, xp]);
    });
  }
}

async function challengeJson(db: Q, me: string, c: any) {
  let challengerScore = c.challenger_score;
  let opponentScore = c.opponent_score;
  if (c.status === 'active') {
    const end = new Date(Math.min(Date.now(), new Date(c.ends_at).getTime()) + 1);
    challengerScore = challengeScore(await periodTotals(db, c.challenger_id, c.starts_at, end), c.metric);
    opponentScore = challengeScore(await periodTotals(db, c.opponent_id, c.starts_at, end), c.metric);
  }
  const iAmChallenger = c.challenger_id === me;
  return {
    id: c.id,
    metric: c.metric,
    days: c.days,
    status: c.status,
    createdAt: c.created_at,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    role: iAmChallenger ? 'challenger' : 'opponent',
    me: { userId: me, score: (iAmChallenger ? challengerScore : opponentScore) ?? 0 },
    rival: {
      userId: iAmChallenger ? c.opponent_id : c.challenger_id,
      username: iAmChallenger ? c.opponent_username : c.challenger_username,
      color: iAmChallenger ? c.opponent_color : c.challenger_color,
      score: (iAmChallenger ? opponentScore : challengerScore) ?? 0,
    },
    winnerId: c.winner_id,
    result: c.status !== 'finished' ? null : c.winner_id === null ? 'draw' : c.winner_id === me ? 'won' : 'lost',
  };
}

const CHALLENGE_SELECT = `
  SELECT c.*, a.username AS challenger_username, a.color AS challenger_color, b.username AS opponent_username, b.color AS opponent_color
  FROM challenges c JOIN users a ON a.id = c.challenger_id JOIN users b ON b.id = c.opponent_id`;

// ---------- rotas ----------
const Id = z.object({ id: z.string().uuid() });
const RegionId = z.object({ id: z.coerce.number().int().positive() });
const NewChallenge = z.object({
  opponentId: z.string().uuid(),
  metric: z.enum(['distance', 'area', 'conquests']),
  days: z.number().int().min(CHALLENGE_DAYS.MIN).max(CHALLENGE_DAYS.MAX),
});
const Bbox = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]));

export function registerGamification(app: FastifyInstance, db: Db, hub: Hub, auth: preHandlerHookHandler) {
  // ----- missões -----
  app.get('/api/missions', { preHandler: auth }, async (req) => missionsFor(db, req.userId));

  app.post('/api/missions/:id/claim', { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(req.params);
    const def = findMission(id);
    if (!def) throw new HttpError(404, 'missão não encontrada');
    const xp = await withTx(db, async (tx) => {
      const b = await periodBounds(tx, def.period);
      if (!pickMissions(req.userId, def.period, b.key).some((m) => m.id === id)) throw new HttpError(404, 'essa missão não é sua neste período');
      const totals = await periodTotals(tx, req.userId, b.start, b.end);
      if (!missionProgress(def, totals, false).completed) throw new HttpError(409, 'missão ainda não concluída');
      const ins = await tx.query(
        `INSERT INTO mission_claims (user_id, mission_id, period_start, xp) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [req.userId, id, b.key, def.xp],
      );
      if (!ins.rowCount) throw new HttpError(409, 'prêmio já resgatado');
      await tx.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [req.userId, def.xp]);
      return def.xp;
    });
    const { rows } = await db.query('SELECT xp FROM users WHERE id = $1', [req.userId]);
    return { xpEarned: xp, xp: rows[0].xp, ...levelFromXp(rows[0].xp), missions: await missionsFor(db, req.userId) };
  });

  // ----- desafios -----
  app.get('/api/challenges', { preHandler: auth }, async (req) => {
    await settleChallenges(db, req.userId);
    const { rows } = await db.query(
      `${CHALLENGE_SELECT} WHERE c.challenger_id = $1 OR c.opponent_id = $1
       ORDER BY (c.status IN ('pending', 'active')) DESC, c.created_at DESC LIMIT 50`,
      [req.userId],
    );
    return Promise.all(rows.map((c) => challengeJson(db, req.userId, c)));
  });

  app.post('/api/challenges', { preHandler: auth }, async (req, reply) => {
    const b = NewChallenge.parse(req.body);
    if (b.opponentId === req.userId) throw new HttpError(400, 'não dá para desafiar você mesmo');
    const { rows: f } = await db.query('SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2', [req.userId, b.opponentId]);
    if (!f[0]) throw new HttpError(403, 'adicione como aliado antes de desafiar');
    let id: string;
    try {
      const { rows } = await db.query(
        `INSERT INTO challenges (challenger_id, opponent_id, metric, days) VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.userId, b.opponentId, b.metric, b.days],
      );
      id = rows[0].id;
    } catch (e: any) {
      if (e.code === '23505') throw new HttpError(409, 'já existe um desafio aberto com esse jogador');
      throw e;
    }
    const { rows } = await db.query(`${CHALLENGE_SELECT} WHERE c.id = $1`, [id]);
    hub.sendTo(b.opponentId, { type: 'challenge', challengeId: id, status: 'pending', byUsername: rows[0].challenger_username });
    return reply.code(201).send(await challengeJson(db, req.userId, rows[0]));
  });

  const transition = (action: 'accept' | 'decline' | 'cancel') =>
    app.post(`/api/challenges/:id/${action}`, { preHandler: auth }, async (req) => {
      const { id } = Id.parse(req.params);
      const who = action === 'cancel' ? 'challenger_id' : 'opponent_id';
      const set =
        action === 'accept'
          ? `status = 'active', starts_at = now(), ends_at = now() + make_interval(days => days)`
          : `status = '${action === 'decline' ? 'declined' : 'cancelled'}'`;
      const { rowCount } = await db.query(`UPDATE challenges SET ${set} WHERE id = $1 AND ${who} = $2 AND status = 'pending'`, [id, req.userId]);
      if (!rowCount) throw new HttpError(404, 'desafio pendente não encontrado');
      const { rows } = await db.query(`${CHALLENGE_SELECT} WHERE c.id = $1`, [id]);
      const c = rows[0];
      const other = c.challenger_id === req.userId ? c.opponent_id : c.challenger_id;
      const byUsername = c.challenger_id === req.userId ? c.challenger_username : c.opponent_username;
      hub.sendTo(other, { type: 'challenge', challengeId: id, status: c.status, byUsername });
      return challengeJson(db, req.userId, c);
    });
  transition('accept');
  transition('decline');
  transition('cancel');

  // ----- bairros e regiões -----
  app.get('/api/regions', { preHandler: auth }, async (req) => {
    const q = z.object({ bbox: Bbox.optional() }).parse(req.query);
    const env = q.bbox ? 'ST_MakeEnvelope($2, $3, $4, $5, 4326)' : null;
    const { rows } = await db.query(
      `WITH r AS (
         SELECT * FROM regions ${env ? `WHERE geom && ${env}` : ''} ORDER BY city, name LIMIT 300
       ),
       s AS (
         SELECT r.id AS region_id, t.user_id, ST_Area(ST_Intersection(r.geom, t.geom)::geography) AS a
         FROM r JOIN territories t ON t.geom && r.geom AND ST_Intersects(t.geom, r.geom)
       ),
       leader AS (
         SELECT DISTINCT ON (region_id) region_id, user_id, a FROM s WHERE a >= 1 ORDER BY region_id, a DESC, user_id
       )
       SELECT r.id, r.name, r.city, r.kind, r.area_m2,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, 0.00003), 6)::json AS geom,
              l.user_id AS leader_id, u.username AS leader_username, u.color AS leader_color, coalesce(l.a, 0) AS leader_area,
              coalesce((SELECT a FROM s WHERE s.region_id = r.id AND s.user_id = $1), 0) AS my_area,
              (SELECT count(*) FROM s WHERE s.region_id = r.id AND s.a >= 1)::int AS players
       FROM r LEFT JOIN leader l ON l.region_id = r.id LEFT JOIN users u ON u.id = l.user_id
       ORDER BY r.city, r.name`,
      q.bbox ? [req.userId, ...q.bbox] : [req.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      kind: r.kind,
      areaM2: r.area_m2,
      geom: r.geom,
      players: r.players,
      leader: r.leader_id ? { userId: r.leader_id, username: r.leader_username, color: r.leader_color, areaM2: r.leader_area, share: r.leader_area / r.area_m2 } : null,
      myAreaM2: r.my_area,
    }));
  });

  app.get('/api/regions/:id/ranking', { preHandler: auth }, async (req, reply) => {
    const { id } = RegionId.parse(req.params);
    const q = z.object({ period: z.enum(['now', 'week', 'month']).default('now') }).parse(req.query);
    const { rows: reg } = await db.query('SELECT id, name, city, kind, area_m2 FROM regions WHERE id = $1', [id]);
    if (!reg[0]) return reply.code(404).send({ error: 'região não encontrada' });
    // "agora": quanto de cada território está dentro do bairro. Semana/mês: área conquistada lá no período.
    const valueSql =
      q.period === 'now'
        ? `SELECT t.user_id, ST_Area(ST_Intersection(g.geom, t.geom)::geography) AS v
           FROM territories t, g WHERE t.geom && g.geom AND ST_Intersects(t.geom, g.geom)`
        : `SELECT e.user_id, sum(ST_Area(ST_Intersection(g.geom, e.geom)::geography)) AS v
           FROM conquest_events e, g
           WHERE e.kind <> 'steal' AND e.geom && g.geom AND e.created_at >= ${periodStartSql(q.period, '$2::text')}
           GROUP BY e.user_id`;
    const { rows } = await db.query(
      `WITH g AS (SELECT geom FROM regions WHERE id = $1), v AS (${valueSql})
       SELECT u.id, u.username, u.color, u.xp, v.v::float8 AS value
       FROM v JOIN users u ON u.id = v.user_id WHERE v.v >= 1
       ORDER BY v.v DESC, u.username LIMIT 100`,
      q.period === 'now' ? [id] : [id, config.timezone],
    );
    return {
      region: { id: reg[0].id, name: reg[0].name, city: reg[0].city, kind: reg[0].kind, areaM2: reg[0].area_m2 },
      period: q.period,
      rows: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.id,
        username: r.username,
        color: r.color,
        level: levelFromXp(r.xp).level,
        value: r.value,
        share: r.value / reg[0].area_m2,
      })),
    };
  });
}
