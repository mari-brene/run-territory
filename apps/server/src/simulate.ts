// Simulador de jogadores: cria contas-robô e faz corridas pela API HTTP, exatamente como o app.
//
//   npm run simulate -w @run-territory/server -- [--url http://localhost:3000] [--center -23.5874,-46.6576] [--live]
//
// Sem --live as corridas são enviadas de uma vez (relógio virtual). Com --live os robôs correm
// em tempo real (acelerado 5x) e aparecem como "correndo agora" no app e no espectador.
import { offset, pathFromMeters, rectangle, type GpsPoint } from '@run-territory/engine';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const URL_BASE = arg('url', 'http://localhost:3000');
const [lat, lng] = arg('center', '-23.5874,-46.6576').split(',').map(Number);
const LIVE = process.argv.includes('--live');
const C = { lat, lng };

async function http(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(URL_BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function bot(username: string) {
  const creds = { username, email: `${username}@bots.runterritory.dev`, password: 'robo-123456' };
  try {
    return (await http(null, 'POST', '/api/auth/register', creds)).token as string;
  } catch {
    return (await http(null, 'POST', '/api/auth/login', { login: username, password: creds.password })).token as string;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(name: string, token: string, pts: GpsPoint[]) {
  const r = await http(token, 'POST', '/api/runs');
  let gained = 0;
  const notes: string[] = [];
  const batch = LIVE ? 2 : 20;
  const t0 = Date.now();
  for (let i = 0; i < pts.length; i += batch) {
    const slice = pts.slice(i, i + batch).map((p) => (LIVE ? { ...p, t: t0 + (p.t - pts[0].t) } : p));
    if (LIVE) await sleep(((slice.at(-1)!.t - t0) - (Date.now() - t0) * 5) / 5);
    const res = await http(token, 'POST', `/api/runs/${r.id}/points`, { points: slice });
    for (const e of res.events) {
      if (e.area) gained += e.area;
      if (e.type !== 'trail_start') notes.push(`${e.type} ${Math.round(e.area ?? 0)} m²`);
      for (const s of e.stolen ?? []) notes.push(`tomou ${Math.round(s.area)} m² de ${s.username}`);
    }
  }
  const s = await http(token, 'POST', `/api/runs/${r.id}/finish`);
  console.log(`${name.padEnd(8)} ${(s.distanceM / 1000).toFixed(2)} km  ritmo ${s.pace}  +${Math.round(gained)} m²  ${notes.join(' · ')}`);
}

const routes: [string, [number, number][]][] = [
  // Ana conquista um quarteirão grande
  ['ana', rectangle(0, 0, 260, 220)],
  // Bia começa a oeste e invade metade do território da Ana
  ['bia', [[-250, 120], [120, 120], [120, 330], [-250, 330], [-250, 120]]],
  // Caio conquista ao sul e depois cerca uma faixa da Ana
  ['caio', rectangle(60, -300, 220, 160)],
  ['caio', [[150, -150], [150, 60], [250, 60], [250, -160]]],
  // Duda faz um laço longe de casa (cruza o próprio rastro)
  ['duda', [[600, 0], [600, 150], [800, 150], [800, 300], [650, 300], [650, 100]]],
];

const tokens = new Map<string, string>();
for (const [name] of routes) if (!tokens.has(name)) tokens.set(name, await bot(name));

let start = Date.now() - 3_600_000;
const jobs: Promise<void>[] = [];
for (const [name, wp] of routes) {
  const pts = pathFromMeters(C, wp, { speedMps: 3.2, startT: start });
  start = pts.at(-1)!.t + 60_000;
  const job = run(name, tokens.get(name)!, pts);
  if (LIVE) jobs.push(job);
  else await job;
}
await Promise.all(jobs);
console.log(`\nPronto. Veja o mapa em ${URL_BASE}/  (centro ${offset(C, 0, 0).lat.toFixed(4)}, ${offset(C, 0, 0).lng.toFixed(4)})`);
