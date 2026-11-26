import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHALLENGE_XP, offset, pathFromMeters, pickMissions, rectangle, type GpsPoint } from '@run-territory/engine';
import { buildApp } from '../src/app';
import { createPool } from '../src/db';
import { migrate } from '../src/migrate';
import { demoGrid, regionsFromGeoJson, upsertRegions } from '../src/regions';

const ORIGIN = { lat: -23.5874, lng: -46.6576 };
const db = createPool(process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/runterritory_test');
const app = buildApp(db, { rateLimit: false });

beforeAll(async () => {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
});

type Player = { token: string; id: string; username: string };
async function register(username: string): Promise<Player> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@ex.com`, password: 'segredo123' } });
  expect(res.statusCode).toBe(201);
  const b = res.json();
  return { token: b.token, id: b.user.id, username };
}
async function raw(p: Player, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as any, headers: { authorization: `Bearer ${p.token}` } });
}
async function call(p: Player, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) {
  const res = await raw(p, method, url, payload);
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json();
}
async function doRun(p: Player, pts: GpsPoint[]) {
  const run = await call(p, 'POST', '/api/runs');
  for (let i = 0; i < pts.length; i += 20) await call(p, 'POST', `/api/runs/${run.id}/points`, { points: pts.slice(i, i + 20) });
  return call(p, 'POST', `/api/runs/${run.id}/finish`);
}
const xpOf = async (p: Player) => (await db.query('SELECT xp FROM users WHERE id = $1', [p.id])).rows[0].xp as number;

let ana: Player, bia: Player, caio: Player;

describe('missões diárias e semanais', () => {
  it('lista 3 diárias e 2 semanais com progresso zerado', async () => {
    ana = await register('ana');
    bia = await register('bia');
    caio = await register('caio');
    const m = await call(ana, 'GET', '/api/missions');
    expect(m.filter((x: any) => x.period === 'day')).toHaveLength(3);
    expect(m.filter((x: any) => x.period === 'week')).toHaveLength(2);
    expect(m.every((x: any) => x.progress === 0 && !x.completed && !x.claimed)).toBe(true);
    // o servidor usa o mesmo sorteio do motor
    const dayKey = m.find((x: any) => x.period === 'day').periodStart;
    expect(m.filter((x: any) => x.period === 'day').map((x: any) => x.id)).toEqual(pickMissions(ana.id, 'day', dayKey).map((x) => x.id));
  });

  it('progresso sobe com a corrida', async () => {
    await doRun(ana, pathFromMeters(ORIGIN, rectangle(0, 0, 200, 200)));
    const m = await call(ana, 'GET', '/api/missions');
    for (const x of m.filter((x: any) => x.metric === 'runs')) expect(x.progress).toBe(1);
    for (const x of m.filter((x: any) => x.metric === 'distance_m')) expect(x.progress).toBeGreaterThan(780);
    for (const x of m.filter((x: any) => x.metric === 'captures')) expect(x.progress).toBe(1);
    const notDone = m.find((x: any) => !x.completed);
    if (notDone) expect((await raw(ana, 'POST', `/api/missions/${notDone.id}/claim`)).statusCode).toBe(409);
  });

  it('resgatar missão concluída dá o XP uma vez só', async () => {
    const duda = await register('duda');
    // deixa todas as missões concluídas: 10 corridas longas, 10 conquistas e 10 tomadas hoje
    for (let i = 0; i < 10; i++) {
      await db.query(`INSERT INTO runs (user_id, status, state, distance_m, ended_at) VALUES ($1, 'finished', '{}', 50000, now())`, [duda.id]);
      await db.query(`INSERT INTO conquest_events (user_id, kind, area_m2) VALUES ($1, 'capture', 10000), ($1, 'steal', 100)`, [duda.id]);
    }
    const m = await call(duda, 'GET', '/api/missions');
    expect(m.every((x: any) => x.completed && !x.claimed)).toBe(true);
    const before = await xpOf(duda);
    for (const x of m) expect((await call(duda, 'POST', `/api/missions/${x.id}/claim`)).xpEarned).toBe(x.xp);
    const total = m.reduce((s: number, x: any) => s + x.xp, 0);
    expect(await xpOf(duda)).toBe(before + total);
    expect((await raw(duda, 'POST', `/api/missions/${m[0].id}/claim`)).statusCode).toBe(409);
    expect((await call(duda, 'GET', '/api/missions')).every((x: any) => x.claimed)).toBe(true);
  });

  it('não deixa resgatar missão que não foi sorteada para você', async () => {
    const mine = new Set((await call(bia, 'GET', '/api/missions')).map((x: any) => x.id));
    const other = ['d_run_1', 'd_km_2', 'd_km_5', 'd_capture_1', 'd_capture_3', 'd_steal_1', 'd_area_5k'].find((id) => !mine.has(id))!;
    expect((await raw(bia, 'POST', `/api/missions/${other}/claim`)).statusCode).toBe(404);
    expect((await raw(bia, 'POST', `/api/missions/nao-existe/claim`)).statusCode).toBe(404);
  });
});

describe('desafios entre amigos', () => {
  let challengeId: string;

  it('só desafia aliados; um desafio aberto por dupla', async () => {
    const body = { opponentId: bia.id, metric: 'distance', days: 7 };
    expect((await raw(ana, 'POST', '/api/challenges', body)).statusCode).toBe(403);
    await call(ana, 'POST', '/api/friends', { username: 'bia' });
    const c = await call(ana, 'POST', '/api/challenges', body);
    challengeId = c.id;
    expect(c).toMatchObject({ status: 'pending', role: 'challenger', rival: { username: 'bia' } });
    expect((await raw(ana, 'POST', '/api/challenges', body)).statusCode).toBe(409);
    expect((await raw(ana, 'POST', '/api/challenges', { ...body, days: 99 })).statusCode).toBe(400);
  });

  it('quem foi desafiado aceita (o desafiante não pode aceitar por ele)', async () => {
    expect((await raw(ana, 'POST', `/api/challenges/${challengeId}/accept`)).statusCode).toBe(404);
    const c = await call(bia, 'POST', `/api/challenges/${challengeId}/accept`);
    expect(c.status).toBe('active');
    expect(new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()).toBeCloseTo(7 * 86400_000, -4);
  });

  it('placar ao vivo e vencedor ao terminar o prazo, com XP dado uma vez', async () => {
    await doRun(bia, pathFromMeters(offset(ORIGIN, 1500, 0), rectangle(0, 0, 300, 300)));
    const live = (await call(bia, 'GET', '/api/challenges')).find((x: any) => x.id === challengeId);
    expect(live.me.score).toBeGreaterThan(1000);
    expect(live.rival.score).toBe(0);

    await db.query(`UPDATE challenges SET starts_at = starts_at - interval '1 hour', ends_at = now() WHERE id = $1`, [challengeId]);
    const before = await xpOf(bia);
    const [fromBia, fromAna] = await Promise.all([call(bia, 'GET', '/api/challenges'), call(ana, 'GET', '/api/challenges')]);
    const done = fromBia.find((x: any) => x.id === challengeId);
    expect(done).toMatchObject({ status: 'finished', result: 'won', winnerId: bia.id });
    expect(fromAna.find((x: any) => x.id === challengeId).result).toBe('lost');
    await call(bia, 'GET', '/api/challenges');
    expect(await xpOf(bia)).toBe(before + CHALLENGE_XP.WIN);
  });

  it('recusar e cancelar', async () => {
    await call(caio, 'POST', '/api/friends', { username: 'ana' });
    const c1 = await call(caio, 'POST', '/api/challenges', { opponentId: ana.id, metric: 'area', days: 3 });
    expect((await call(ana, 'POST', `/api/challenges/${c1.id}/decline`)).status).toBe('declined');
    const c2 = await call(caio, 'POST', '/api/challenges', { opponentId: ana.id, metric: 'conquests', days: 1 });
    expect((await raw(ana, 'POST', `/api/challenges/${c2.id}/cancel`)).statusCode).toBe(404);
    expect((await call(caio, 'POST', `/api/challenges/${c2.id}/cancel`)).status).toBe('cancelled');
  });
});

describe('disputas por bairro', () => {
  it('importa regiões de GeoJSON e da grade de teste', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { NOME: 'Vila Teste' }, geometry: { type: 'Polygon', coordinates: [[[-46.66, -23.59], [-46.65, -23.59], [-46.65, -23.58], [-46.66, -23.58], [-46.66, -23.59]]] } },
        { type: 'Feature', properties: { NOME: 'Sem geometria' }, geometry: null },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      ],
    };
    const parsed = regionsFromGeoJson(fc, { city: 'São Paulo', kind: 'bairro' });
    expect(parsed.map((r) => r.name)).toEqual(['Vila Teste']);
    expect(await upsertRegions(db, parsed)).toBe(1);
    expect(await upsertRegions(db, parsed)).toBe(1); // reimportar atualiza, não duplica
    expect(await upsertRegions(db, demoGrid(ORIGIN, 600, 3, 'Demo'))).toBe(9);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM regions');
    expect(rows[0].n).toBe(10);
  });

  it('mostra quem domina cada região e o ranking do bairro', async () => {
    const regions = await call(ana, 'GET', `/api/regions?bbox=-46.70,-23.62,-46.60,-23.55`);
    const vila = regions.find((r: any) => r.name === 'Vila Teste');
    expect(vila.areaM2).toBeGreaterThan(1_000_000);
    expect(vila.leader.username).toBe('ana'); // a corrida da Ana foi dentro da Vila Teste
    expect(vila.myAreaM2).toBeGreaterThan(40_000);
    expect(vila.leader.share).toBeGreaterThan(0);
    expect(['Polygon', 'MultiPolygon']).toContain(vila.geom.type);

    const now = await call(bia, 'GET', `/api/regions/${vila.id}/ranking`);
    expect(now.rows[0]).toMatchObject({ rank: 1, username: 'ana' });
    const week = await call(bia, 'GET', `/api/regions/${vila.id}/ranking?period=week`);
    expect(week.rows[0].username).toBe('ana');
    expect(week.rows[0].value).toBeGreaterThan(40_000);
    expect((await raw(bia, 'GET', `/api/regions/99999/ranking`)).statusCode).toBe(404);
  });

  it('ranking geral por semana continua funcionando com o fuso do jogo', async () => {
    for (const by of ['area', 'distance', 'conquests'])
      for (const period of ['week', 'month', 'all']) {
        const rows = await call(ana, 'GET', `/api/rankings?by=${by}&period=${period}`);
        expect(rows.length).toBeGreaterThan(0);
      }
  });
});
