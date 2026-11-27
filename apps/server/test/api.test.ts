import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { pathFromMeters, rectangle, offset, RunTracker, TurfWorld, newRunState, type GpsPoint } from '@run-territory/engine';
import { buildApp } from '../src/app';
import { createPool } from '../src/db';
import { migrate } from '../src/migrate';

const ORIGIN = { lat: -23.5874, lng: -46.6576 }; // Ibirapuera
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

async function call(p: Player, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  const res = await app.inject({ method, url, payload: payload as any, headers: { authorization: `Bearer ${p.token}` } });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Faz uma corrida completa enviando o GPS em lotes, como o app faz. */
async function doRun(p: Player, pts: GpsPoint[], { finish = true, batch = 15 } = {}) {
  const run = await call(p, 'POST', '/api/runs');
  const events: any[] = [];
  for (let i = 0; i < pts.length; i += batch) {
    const r = await call(p, 'POST', `/api/runs/${run.id}/points`, { points: pts.slice(i, i + batch) });
    events.push(...r.events);
  }
  const summary = finish ? await call(p, 'POST', `/api/runs/${run.id}/finish`) : null;
  return { runId: run.id as string, events, summary };
}

async function areaOf(p: Player) {
  const { rows } = await db.query('SELECT area_m2 FROM territories WHERE user_id = $1', [p.id]);
  return (rows[0]?.area_m2 as number) ?? 0;
}

async function maxOverlap() {
  const { rows } = await db.query(
    `SELECT coalesce(max(ST_Area(ST_Intersection(a.geom, b.geom)::geography)), 0) AS o
     FROM territories a JOIN territories b ON a.user_id < b.user_id AND a.geom && b.geom`,
  );
  return rows[0].o as number;
}

let ana: Player, bia: Player, caio: Player;

describe('contas', () => {
  it('cadastra, faz login e lê o perfil', async () => {
    ana = await register('ana');
    bia = await register('bia');
    caio = await register('caio');
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'ANA', email: 'x@ex.com', password: 'segredo123' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'ana', password: 'errada' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'ana@ex.com', password: 'segredo123' } });
    expect(ok.statusCode).toBe(200);
    const me = await call(ana, 'GET', '/api/me');
    expect(me.username).toBe('ana');
    expect(me.level).toBe(1);
    expect(me.color).toMatch(/^#/);
    const unauth = await app.inject({ method: 'GET', url: '/api/me' });
    expect(unauth.statusCode).toBe(401);
  });
});

describe('conquista no servidor (PostGIS)', () => {
  it('Ana fecha um quadrado de 200 m — mesma área que o motor em Turf', async () => {
    const pts = pathFromMeters(ORIGIN, rectangle(0, 0, 200, 200));
    const { events, summary } = await doRun(ana, pts);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['base', 'trail_start', 'capture']));
    const area = await areaOf(ana);

    const tw = new TurfWorld();
    const tr = new RunTracker(tw);
    const st = newRunState();
    for (const p of pts) await tr.step('ana', st, p);
    expect(Math.abs(area - tw.areaOf('ana')) / area).toBeLessThan(0.02);

    expect(area).toBeGreaterThan(44_000);
    expect(summary.distanceM).toBeGreaterThan(780);
    expect(summary.areaGainedM2).toBeCloseTo(area, -1);
    expect(summary.path.length).toBeGreaterThan(70);
    expect(summary.conquests.map((c: any) => c.kind)).toEqual(['base', 'capture']);
    expect(summary.xpEarned).toBeGreaterThan(80);
  });

  it('Bia toma parte do território da Ana; ninguém se sobrepõe', async () => {
    const anaBefore = await areaOf(ana);
    const pts = pathFromMeters(ORIGIN, [[-150, 100], [100, 100], [100, 300], [-150, 300], [-150, 100]]);
    const { events, summary } = await doRun(bia, pts);
    const cap = events.find((e) => e.type === 'capture');
    expect(cap.stolen).toHaveLength(1);
    expect(cap.stolen[0].username).toBe('ana');
    const stolen = cap.stolen[0].area;
    expect(stolen).toBeGreaterThan(9_000);
    expect(await areaOf(ana)).toBeCloseTo(anaBefore - stolen, -1);
    expect(await maxOverlap()).toBeLessThan(0.5);
    expect(summary.steals[0].victim).toBe('ana');

    const anaEvents = await call(ana, 'GET', '/api/events');
    expect(anaEvents[0]).toMatchObject({ direction: 'loss', kind: 'steal', byUsername: 'bia' });
  });

  it('Caio cerca a base da Bia e fica com ela inteira (laço longe de casa)', async () => {
    // Bia tem uma ilha a leste: uma corrida de base isolada
    const island = offset(ORIGIN, 1500, 0);
    const bia2 = await register('bia2');
    await doRun(bia2, pathFromMeters(island, [[0, 0], [5, 0]]));
    expect(await areaOf(bia2)).toBeGreaterThan(2700);

    // Caio começa longe e fecha um laço em volta da ilha cruzando o próprio rastro
    const { events } = await doRun(caio, pathFromMeters(island, [[-300, -100], [100, -100], [100, 100], [-100, 100], [-100, -120]]));
    const loop = events.find((e) => e.type === 'loop_capture');
    expect(loop).toBeTruthy();
    expect(loop.stolen[0].username).toBe('bia2');
    expect(await areaOf(bia2)).toBe(0);
    expect(await maxOverlap()).toBeLessThan(0.5);
  });

  it('dois corredores ao mesmo tempo mantêm a invariante de não sobreposição', async () => {
    const o = offset(ORIGIN, 0, 3000);
    const d1 = await register('duda');
    const d2 = await register('edu');
    const a = pathFromMeters(o, rectangle(0, 0, 150, 150));
    const b = pathFromMeters(o, [[220, 75], [75, 75], [75, 225], [220, 225], [220, 75]]);
    await Promise.all([doRun(d1, a, { batch: 5 }), doRun(d2, b, { batch: 5 })]);
    expect(await areaOf(d1)).toBeGreaterThan(5_000);
    expect(await areaOf(d2)).toBeGreaterThan(5_000);
    expect(await maxOverlap()).toBeLessThan(0.5);
  });
});

describe('corrida: pausa, retomada e histórico', () => {
  it('pausar bloqueia pontos; retomar continua; finalizar com rastro aberto perde o rastro', async () => {
    const o = offset(ORIGIN, -3000, 0);
    const p = await register('fabi');
    const run = await call(p, 'POST', '/api/runs');
    const again = await call(p, 'POST', '/api/runs');
    expect(again.id).toBe(run.id); // uma corrida aberta por vez
    const pts = pathFromMeters(o, [[0, 0], [0, 100]]);
    await call(p, 'POST', `/api/runs/${run.id}/points`, { points: pts });
    await call(p, 'POST', `/api/runs/${run.id}/pause`);
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/runs/${run.id}/points`,
      payload: { points: pts.slice(-1) },
      headers: { authorization: `Bearer ${p.token}` },
    });
    expect(blocked.statusCode).toBe(409);
    await call(p, 'POST', `/api/runs/${run.id}/resume`);
    const later = pathFromMeters(o, [[0, 110], [0, 200]], { startT: pts.at(-1)!.t + 600_000 });
    const r = await call(p, 'POST', `/api/runs/${run.id}/points`, { points: later });
    expect(r.stats.distanceM).toBeGreaterThan(160);
    expect(r.stats.distanceM).toBeLessThan(195);
    const s = await call(p, 'POST', `/api/runs/${run.id}/finish`);
    expect(s.status).toBe('finished');
    expect(s.pace).toMatch(/^\d+:\d\d$/);
    const hist = await call(p, 'GET', '/api/runs');
    expect(hist).toHaveLength(1);
    expect(await call(p, 'GET', '/api/runs/current')).toBeNull();
  });
});

describe('mapa, ranking, perfil e amigos', () => {
  it('lista territórios por bbox com relação eu/amigo/rival', async () => {
    await call(ana, 'POST', '/api/friends', { username: 'bia' });
    const bb = [offset(ORIGIN, -500, -500), offset(ORIGIN, 500, 500)];
    const fc = await call(ana, 'GET', `/api/territories?bbox=${bb[0].lng},${bb[0].lat},${bb[1].lng},${bb[1].lat}`);
    const rel = Object.fromEntries(fc.features.map((f: any) => [f.properties.username, f.properties.relation]));
    expect(rel).toEqual({ ana: 'me', bia: 'friend' });
    expect((await call(ana, 'GET', '/api/friends')).map((f: any) => f.username)).toEqual(['bia']);
  });

  it('ranking por território, distância e conquistas', async () => {
    const byArea = await call(ana, 'GET', '/api/rankings?by=area');
    expect(byArea[0].value).toBeGreaterThanOrEqual(byArea[1].value);
    expect(byArea.map((r: any) => r.username)).toContain('caio');
    const byDist = await call(ana, 'GET', '/api/rankings?by=distance&period=week');
    expect(byDist[0].value).toBeGreaterThan(700);
    const byConq = await call(ana, 'GET', '/api/rankings?by=conquests&period=month');
    expect(byConq.find((r: any) => r.username === 'bia').value).toBe(2); // captura + tomada
    const friends = await call(ana, 'GET', '/api/rankings?by=area&scope=friends');
    expect(friends.map((r: any) => r.username).sort()).toEqual(['ana', 'bia']);
  });

  it('perfil traz nível, totais e medalhas', async () => {
    const prof = await call(ana, 'GET', `/api/users/${bia.id}`);
    expect(prof.isFriend).toBe(true);
    expect(prof.totals.steals).toBe(1);
    const earned = prof.medals.filter((m: any) => m.earned).map((m: any) => m.id);
    expect(earned).toEqual(expect.arrayContaining(['first_run', 'first_capture', 'thief']));
  });

  it('salva o visual do corredor e recusa itens ainda bloqueados', async () => {
    const me = await call(caio, 'GET', '/api/me');
    expect(me.look.pattern).toBe('liso');
    const saved = await call(caio, 'PATCH', '/api/me', { look: { ...me.look, hair: 'cacheado', pattern: 'listras', emblem: 'estrela', lixo: 1 } });
    expect(saved.look).toMatchObject({ hair: 'cacheado', pattern: 'listras', emblem: 'estrela' });
    expect(saved.look).not.toHaveProperty('lixo');
    expect(saved.color).toBe(me.color);
    // Xadrez pede nível 7; a cor continua a mesma.
    const locked = await app.inject({ method: 'PATCH', url: '/api/me', payload: { look: { pattern: 'xadrez' } }, headers: { authorization: `Bearer ${caio.token}` } });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error).toContain('Nível 7');
    // Raio pede a medalha Invasor, que a bia tem.
    await call(bia, 'PATCH', '/api/me', { look: { emblem: 'raio' } });
    const bb = [offset(ORIGIN, -2000, -2000), offset(ORIGIN, 2000, 2000)];
    const fc = await call(ana, 'GET', `/api/territories?bbox=${bb[0].lng},${bb[0].lat},${bb[1].lng},${bb[1].lat}`);
    const props = Object.fromEntries(fc.features.map((f: any) => [f.properties.username, f.properties]));
    expect(props.bia.emblem).toBe('raio');
    expect(props.caio.pattern).toBe('listras');
    expect((await call(ana, 'GET', `/api/users/${caio.id}`)).look.hair).toBe('cacheado');
  });
});

describe('tempo real', () => {
  it('WebSocket avisa a vítima e todos os clientes', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as any).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${ana.token}`);
    const msgs: any[] = [];
    await new Promise((res) => ws.on('open', res));
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    // Bia entra de novo no território da Ana
    await doRun(bia, pathFromMeters(ORIGIN, [[-100, 150], [150, 150], [150, 50], [-100, 50], [-100, 150]]));
    await new Promise((r) => setTimeout(r, 200));
    ws.close();
    const types = new Set(msgs.map((m) => m.type));
    expect(types).toContain('hello');
    expect(types).toContain('runner');
    expect(types).toContain('territories_changed');
    expect(types).toContain('territory_lost');
  });
});
