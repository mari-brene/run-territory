import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { formatPace, avgSpeedKmh, levelFromXp, medals } from '@run-territory/engine';
import type { Db } from './db';
import { createSession, endSession, bearer, hashPassword, purgeExpiredSessions, randomColor, requireAuth, userIdFromToken, verifyPassword, verifyPasswordOrDummy, PALETTE } from './auth';
import { Hub } from './realtime';
import { HttpError, RunService, toRun } from './runService';
import { config } from './config';
import { periodStartSql, registerGamification } from './gamification';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const maplibreDir = path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl.js'));

const Register = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[\p{L}0-9_.-]+$/u, 'use letras, números, _ . -'),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(200),
});
const Login = z.object({ login: z.string().trim().min(1), password: z.string().min(1) });
const Point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  t: z.number().int().positive(),
  acc: z.number().nonnegative().nullish(),
});
const Points = z.object({ points: z.array(Point).min(1).max(500) });
const Bbox = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]));

/** Esconde o token do WebSocket (?token=...) dos logs. */
const redactUrl = (url: string) => url.replace(/([?&]token=)[^&]*/g, '$1***');

export function buildApp(db: Db, opts: { logger?: boolean; rateLimit?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger
      ? {
          serializers: {
            req: (req) => ({ method: req.method, url: redactUrl(req.url), remoteAddress: req.ip }),
          },
        }
      : false,
    trustProxy: config.trustProxy,
    bodyLimit: 512 * 1024,
  });
  const hub = new Hub();
  const runs = new RunService(db, hub);
  const auth = requireAuth(db);

  app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : true });
  // Cabeçalhos de segurança. CSP desligada: o mapa de espectador carrega estilo e blocos de outro domínio.
  app.register(helmet, { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false });
  const limitOn = opts.rateLimit ?? config.rateLimit;
  if (limitOn)
    app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      // O simulador de robôs roda na mesma máquina e manda muitos pontos; login/cadastro continuam limitados.
      allowList: (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip) && !req.url.startsWith('/api/auth') && !req.url.startsWith('/api/me'),
    });
  /** Limite mais duro para login e cadastro (contra adivinhação de senha). */
  const authLimit = limitOn ? { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } : {};

  // Limpa sessões vencidas de vez em quando.
  const purge = setInterval(() => purgeExpiredSessions(db).catch(() => {}), 6 * 3600 * 1000);
  purge.unref();
  app.addHook('onClose', async () => clearInterval(purge));
  app.register(websocket);
  app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  app.register(fastifyStatic, { root: maplibreDir, prefix: '/vendor/maplibre/', decorateReply: false });

  app.setErrorHandler((err: FastifyError | HttpError | z.ZodError, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'dados inválidos', issues: err.issues });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if ((err as any).code === '23505') return reply.code(409).send({ error: 'já existe' });
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      app.log.error(err);
      // Não expõe detalhes internos (SQL, caminhos) para quem chama a API.
      return reply.code(status).send({ error: 'erro interno do servidor' });
    }
    return reply.code(status).send({ error: err.message });
  });

  const userJson = (u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    color: u.color,
    xp: u.xp,
    ...levelFromXp(u.xp),
  });

  // As rotas ficam num plugin registrado DEPOIS do rate-limit, para o limite valer para elas.
  app.register(async (app) => {
    // ---------- contas ----------
    app.post('/api/auth/register', authLimit, async (req, reply) => {
      const b = Register.parse(req.body);
      const taken = await db.query('SELECT 1 FROM users WHERE lower(username) = lower($1) OR email = $2', [b.username, b.email]);
      if (taken.rows[0]) return reply.code(409).send({ error: 'usuário ou e-mail já cadastrado' });
      const { rows } = await db.query(
        'INSERT INTO users (username, email, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [b.username, b.email, await hashPassword(b.password), randomColor()],
      );
      return reply.code(201).send({ token: await createSession(db, rows[0].id), user: userJson(rows[0]) });
    });

    app.post('/api/auth/login', authLimit, async (req, reply) => {
      const b = Login.parse(req.body);
      const { rows } = await db.query('SELECT * FROM users WHERE lower(username) = lower($1) OR email = lower($1)', [b.login]);
      if (!(await verifyPasswordOrDummy(b.password, rows[0]?.password_hash)))
        return reply.code(401).send({ error: 'usuário ou senha incorretos' });
      return { token: await createSession(db, rows[0].id), user: userJson(rows[0]) };
    });

    app.post('/api/auth/logout', { preHandler: auth }, async (req) => {
      await endSession(db, bearer(req)!);
      return { ok: true };
    });

    app.get('/api/me', { preHandler: auth }, async (req) => {
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      return userJson(rows[0]);
    });

    app.patch('/api/me', { preHandler: auth }, async (req) => {
      const b = z.object({ color: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }).parse(req.body);
      const { rows } = await db.query('UPDATE users SET color = $2 WHERE id = $1 RETURNING *', [req.userId, b.color]);
      hub.broadcast({ type: 'territories_changed', userIds: [req.userId], by: req.userId });
      return userJson(rows[0]);
    });

    // Excluir a conta (exigido pela LGPD e pelas lojas de apps). Pede a senha de novo.
    app.delete('/api/me', { preHandler: auth, ...authLimit }, async (req, reply) => {
      const b = z.object({ password: z.string().min(1) }).parse(req.body);
      const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
      if (!rows[0] || !(await verifyPassword(b.password, rows[0].password_hash))) return reply.code(401).send({ error: 'senha incorreta' });
      await db.query('DELETE FROM users WHERE id = $1', [req.userId]); // sessões, corridas, território e amizades vão junto
      hub.broadcast({ type: 'territories_changed', userIds: [req.userId], by: req.userId });
      hub.broadcast({ type: 'runner_stopped', userId: req.userId });
      return { ok: true };
    });

    app.get('/api/palette', async () => PALETTE);

    // ---------- territórios ----------
    app.get('/api/territories', { preHandler: auth }, async (req) => {
      const q = z.object({ bbox: Bbox.optional() }).parse(req.query);
      const params: unknown[] = [req.userId];
      let where = '';
      if (q.bbox) {
        params.push(...q.bbox);
        where = 'WHERE t.geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)';
      }
      const { rows } = await db.query(
        `SELECT t.user_id, u.username, u.color, t.area_m2, ST_AsGeoJSON(t.geom, 6)::json AS geom,
                EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = t.user_id) AS friend
         FROM territories t JOIN users u ON u.id = t.user_id ${where}`,
        params,
      );
      return {
        type: 'FeatureCollection',
        features: rows.map((r) => ({
          type: 'Feature',
          geometry: r.geom,
          properties: {
            userId: r.user_id,
            username: r.username,
            color: r.color,
            areaM2: r.area_m2,
            relation: r.user_id === req.userId ? 'me' : r.friend ? 'friend' : 'rival',
          },
        })),
      };
    });

    // corredores ativos agora (multiplayer ao vivo)
    app.get('/api/live', { preHandler: auth }, async () => {
      const { rows } = await db.query(
        `SELECT r.user_id, u.username, u.color, ST_X(r.last_point) AS lng, ST_Y(r.last_point) AS lat, r.state->'trail' AS trail
         FROM runs r JOIN users u ON u.id = r.user_id
         WHERE r.status = 'active' AND r.last_point_at > now() - make_interval(secs => $1)`,
        [config.liveWindowS],
      );
      return rows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        color: r.color,
        lat: r.lat,
        lng: r.lng,
        trail: (r.trail ?? []).map((p: any) => [p.lng, p.lat]),
      }));
    });

    // ---------- corridas ----------
    app.post('/api/runs', { preHandler: auth }, async (req, reply) => reply.code(201).send(await runs.start(req.userId)));

    app.get('/api/runs/current', { preHandler: auth }, async (req) => {
      const { rows } = await db.query(`SELECT * FROM runs WHERE user_id = $1 AND status <> 'finished'`, [req.userId]);
      return rows[0] ? toRun(rows[0]) : null;
    });

    const RunId = z.object({ id: z.string().uuid() });
    app.post('/api/runs/:id/points', { preHandler: auth }, async (req) => {
      const { id } = RunId.parse(req.params);
      return runs.addPoints(req.userId, id, Points.parse(req.body).points);
    });
    app.post('/api/runs/:id/pause', { preHandler: auth }, async (req) => runs.pause(req.userId, RunId.parse(req.params).id));
    app.post('/api/runs/:id/resume', { preHandler: auth }, async (req) => runs.resume(req.userId, RunId.parse(req.params).id));
    app.post('/api/runs/:id/finish', { preHandler: auth }, async (req) => {
      const { id } = RunId.parse(req.params);
      const f = await runs.finish(req.userId, id);
      return { ...(await runSummary(db, req.userId, id)), trailLost: f.trailLost };
    });

    app.get('/api/runs', { preHandler: auth }, async (req) => {
      const { rows } = await db.query(
        `SELECT * FROM runs WHERE user_id = $1 AND status = 'finished' ORDER BY started_at DESC LIMIT 100`,
        [req.userId],
      );
      return rows.map((r) => ({ ...toRun(r), trail: undefined, pace: formatPace(r.distance_m, r.moving_time_s) }));
    });

    app.get('/api/runs/:id', { preHandler: auth }, async (req) => runSummary(db, req.userId, RunId.parse(req.params).id));

    // ---------- histórico de conquistas e perdas ----------
    app.get('/api/events', { preHandler: auth }, async (req) => {
      const { rows } = await db.query(
        `SELECT e.id, e.kind, e.area_m2, e.created_at, e.run_id,
                CASE WHEN e.victim_id = $1 THEN 'loss' ELSE 'gain' END AS direction,
                a.username AS by_username, v.username AS victim_username
         FROM conquest_events e
         JOIN users a ON a.id = e.user_id
         LEFT JOIN users v ON v.id = e.victim_id
         WHERE e.user_id = $1 OR e.victim_id = $1
         ORDER BY e.created_at DESC, e.id DESC LIMIT 100`,
        [req.userId],
      );
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        direction: r.direction,
        areaM2: r.area_m2,
        createdAt: r.created_at,
        runId: r.run_id,
        byUsername: r.by_username,
        victimUsername: r.victim_username,
      }));
    });

    // ---------- ranking ----------
    app.get('/api/rankings', { preHandler: auth }, async (req) => {
      const q = z
        .object({
          by: z.enum(['area', 'distance', 'conquests']).default('area'),
          period: z.enum(['week', 'month', 'all']).default('all'),
          scope: z.enum(['all', 'friends']).default('all'),
        })
        .parse(req.query);
      // $2 = fuso do jogo, para "esta semana" começar na segunda à meia-noite local.
      const since = q.period === 'all' ? "'-infinity'::timestamptz" : periodStartSql(q.period, '$2::text');
      const friendsFilter =
        q.scope === 'friends' ? 'AND (u.id = $1 OR u.id IN (SELECT friend_id FROM friendships WHERE user_id = $1))' : 'AND $1::uuid IS NOT NULL';
      const valueSql = {
        // área é o estado atual do mapa; no período, conta a área conquistada no período
        area:
          q.period === 'all'
            ? 'coalesce((SELECT area_m2 FROM territories t WHERE t.user_id = u.id), 0)'
            : `coalesce((SELECT sum(area_m2) FROM conquest_events e WHERE e.user_id = u.id AND e.kind <> 'steal' AND e.created_at >= ${since}), 0)`,
        distance: `coalesce((SELECT sum(distance_m) FROM runs r WHERE r.user_id = u.id AND r.started_at >= ${since}), 0)`,
        conquests: `(SELECT count(*) FROM conquest_events e WHERE e.user_id = u.id AND e.kind IN ('capture', 'loop_capture', 'steal') AND e.created_at >= ${since})`,
      }[q.by];
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.color, u.xp, ${valueSql}::float8 AS value
         FROM users u WHERE $2::text IS NOT NULL ${friendsFilter}
         ORDER BY value DESC, u.username LIMIT 100`,
        [req.userId, config.timezone],
      );
      return rows.map((r, i) => ({ rank: i + 1, userId: r.id, username: r.username, color: r.color, level: levelFromXp(r.xp).level, value: r.value }));
    });

    // ---------- perfil ----------
    app.get('/api/users/:id', { preHandler: auth }, async (req, reply) => {
      const { id } = RunId.parse(req.params);
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.color, u.xp, u.created_at,
           coalesce((SELECT area_m2 FROM territories WHERE user_id = u.id), 0) AS area_m2,
           (SELECT count(*) FROM runs WHERE user_id = u.id AND status = 'finished')::int AS runs,
           coalesce((SELECT sum(distance_m) FROM runs WHERE user_id = u.id), 0)::float8 AS distance_m,
           coalesce((SELECT sum(moving_time_s) FROM runs WHERE user_id = u.id), 0)::float8 AS moving_time_s,
           (SELECT count(*) FROM conquest_events WHERE user_id = u.id AND kind IN ('capture', 'loop_capture'))::int AS captures,
           (SELECT count(*) FROM conquest_events WHERE user_id = u.id AND kind = 'steal')::int AS steals,
           (SELECT count(*) FROM conquest_events WHERE victim_id = u.id)::int AS losses,
           EXISTS (SELECT 1 FROM friendships WHERE user_id = $2 AND friend_id = u.id) AS is_friend
         FROM users u WHERE u.id = $1`,
        [id, req.userId],
      );
      const u = rows[0];
      if (!u) return reply.code(404).send({ error: 'jogador não encontrado' });
      return {
        id: u.id,
        username: u.username,
        color: u.color,
        memberSince: u.created_at,
        xp: u.xp,
        ...levelFromXp(u.xp),
        isFriend: u.is_friend,
        totals: {
          areaM2: u.area_m2,
          runs: u.runs,
          distanceM: u.distance_m,
          movingTimeS: u.moving_time_s,
          captures: u.captures,
          steals: u.steals,
          losses: u.losses,
          pace: formatPace(u.distance_m, u.moving_time_s),
        },
        medals: medals({ totalDistanceM: u.distance_m, runs: u.runs, areaM2: u.area_m2, captures: u.captures, steals: u.steals }),
      };
    });

    // ---------- amigos ----------
    app.get('/api/friends', { preHandler: auth }, async (req) => {
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.color, u.xp, coalesce(t.area_m2, 0) AS area_m2
         FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN territories t ON t.user_id = u.id
         WHERE f.user_id = $1 ORDER BY u.username`,
        [req.userId],
      );
      return rows.map((r) => ({ id: r.id, username: r.username, color: r.color, level: levelFromXp(r.xp).level, areaM2: r.area_m2 }));
    });

    app.post('/api/friends', { preHandler: auth }, async (req, reply) => {
      const { username } = z.object({ username: z.string().trim().min(1) }).parse(req.body);
      const { rows } = await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
      if (!rows[0]) return reply.code(404).send({ error: 'jogador não encontrado' });
      if (rows[0].id === req.userId) return reply.code(400).send({ error: 'você não pode adicionar a si mesmo' });
      await db.query('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, rows[0].id]);
      return reply.code(201).send({ ok: true });
    });

    app.delete('/api/friends/:id', { preHandler: auth }, async (req) => {
      await db.query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [req.userId, RunId.parse(req.params).id]);
      return { ok: true };
    });

    app.get('/api/users', { preHandler: auth }, async (req) => {
      const { q } = z.object({ q: z.string().trim().min(1) }).parse(req.query);
      const { rows } = await db.query(
        `SELECT id, username, color FROM users WHERE username ILIKE $1 AND id <> $2 ORDER BY username LIMIT 20`,
        [`%${q.replace(/[%_]/g, '')}%`, req.userId],
      );
      return rows;
    });

    registerGamification(app, db, hub, auth);

    // ---------- tempo real ----------
    app.register(async (instance) => {
      instance.get('/ws', { websocket: true }, async (socket, req) => {
        const token = (req.query as any)?.token as string | undefined;
        const uid = await userIdFromToken(db, token);
        if (!uid) return socket.close(4401, 'não autenticado');
        hub.add(socket, uid);
        socket.send(JSON.stringify({ type: 'hello', userId: uid }));
      });
    });

    // ---------- espectador (público, só leitura) ----------
    app.get('/api/public/map', async () => {
      const { rows: t } = await db.query(
        `SELECT t.user_id, u.username, u.color, t.area_m2, ST_AsGeoJSON(t.geom, 6)::json AS geom
         FROM territories t JOIN users u ON u.id = t.user_id`,
      );
      // Posição ao vivo é dado sensível: em produção só aparece para quem está logado (PUBLIC_LIVE_RUNNERS).
      const { rows: l } = config.publicLiveRunners
        ? await db.query(
            `SELECT r.user_id, u.username, u.color, ST_X(r.last_point) AS lng, ST_Y(r.last_point) AS lat, r.state->'trail' AS trail
             FROM runs r JOIN users u ON u.id = r.user_id
             WHERE r.status = 'active' AND r.last_point_at > now() - make_interval(secs => $1)`,
            [config.liveWindowS],
          )
        : { rows: [] as any[] };
      return {
        territories: {
          type: 'FeatureCollection',
          features: t.map((r) => ({ type: 'Feature', geometry: r.geom, properties: { userId: r.user_id, username: r.username, color: r.color, areaM2: r.area_m2 } })),
        },
        live: l.map((r) => ({ userId: r.user_id, username: r.username, color: r.color, lat: r.lat, lng: r.lng, trail: (r.trail ?? []).map((p: any) => [p.lng, p.lat]) })),
      };
    });

    app.get('/api/health', async (_req, reply) => {
      try {
        await db.query('SELECT 1');
        return { ok: true };
      } catch {
        return reply.code(503).send({ ok: false, error: 'banco indisponível' });
      }
    });
  });

  return app;
}

async function runSummary(db: Db, userId: string, runId: string) {
  const { rows } = await db.query('SELECT * FROM runs WHERE id = $1 AND user_id = $2', [runId, userId]);
  if (!rows[0]) throw new HttpError(404, 'corrida não encontrada');
  const r = rows[0];
  const { rows: pts } = await db.query('SELECT lat, lng FROM run_points WHERE run_id = $1 AND accepted ORDER BY seq', [runId]);
  const { rows: ev } = await db.query(
    `SELECT e.kind, e.area_m2, v.username AS victim, ST_AsGeoJSON(e.geom, 6)::json AS geom
     FROM conquest_events e LEFT JOIN users v ON v.id = e.victim_id WHERE e.run_id = $1 AND e.user_id = $2 ORDER BY e.id`,
    [runId, userId],
  );
  return {
    ...toRun(r),
    trail: undefined,
    pace: formatPace(r.distance_m, r.moving_time_s),
    avgSpeedKmh: avgSpeedKmh(r.distance_m, r.moving_time_s),
    path: pts.map((p) => [p.lng, p.lat]),
    conquests: ev.filter((e) => e.kind !== 'steal').map((e) => ({ kind: e.kind, areaM2: e.area_m2, geom: e.geom })),
    steals: ev.filter((e) => e.kind === 'steal').map((e) => ({ victim: e.victim, areaM2: e.area_m2, geom: e.geom })),
  };
}
