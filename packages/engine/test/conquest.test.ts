import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import {
  RunTracker,
  TurfWorld,
  newRunState,
  offset,
  pathFromMeters,
  rectangle,
  turfOps,
  type GpsPoint,
  type RunEvent,
  type World,
} from '../src';

export const ORIGIN = { lat: -23.5874, lng: -46.6576 }; // Ibirapuera, São Paulo

async function run(world: World, userId: string, pts: GpsPoint[], opts: { finish?: boolean } = {}) {
  const tracker = new RunTracker(world);
  const state = newRunState();
  const events: RunEvent[] = [];
  for (const p of pts) events.push(...(await tracker.step(userId, state, p)));
  if (opts.finish !== false) events.push(...tracker.finish(state));
  return { state, events, tracker };
}

const ofType = (ev: RunEvent[], t: string) => ev.filter((e) => e.type === t) as any[];

function overlap(world: TurfWorld, a: string, b: string) {
  return turfOps.area(turfOps.intersect(world.get(a), world.get(b)));
}

describe('base inicial', () => {
  it('cria base circular de ~30 m de raio no primeiro ponto', async () => {
    const w = new TurfWorld();
    const { events } = await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0], [5, 0]]));
    const base = ofType(events, 'base');
    expect(base).toHaveLength(1);
    expect(base[0].area).toBeGreaterThan(2700);
    expect(base[0].area).toBeLessThan(2830); // π·30² ≈ 2827
  });

  it('não recria a base se o jogador já tem território', async () => {
    const w = new TurfWorld();
    await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0]]));
    const { events } = await run(w, 'ana', pathFromMeters(ORIGIN, [[1000, 0]]));
    expect(ofType(events, 'base')).toHaveLength(0);
  });

  it('a base não rouba área de ninguém', async () => {
    const w = new TurfWorld();
    await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0]]));
    const before = w.areaOf('ana');
    await run(w, 'bia', pathFromMeters(ORIGIN, [[40, 0]])); // círculos se sobrepõem
    expect(w.areaOf('ana')).toBeCloseTo(before, 0);
    expect(w.areaOf('bia')).toBeLessThan(2700);
    expect(overlap(w, 'ana', 'bia')).toBeLessThan(1);
  });
});

describe('conquista ao voltar ao território', () => {
  it('fecha um quadrado de 200 m saindo e voltando para a base', async () => {
    const w = new TurfWorld();
    const { events, state } = await run(w, 'ana', pathFromMeters(ORIGIN, rectangle(0, 0, 200, 200)));
    const cap = ofType(events, 'capture');
    expect(cap).toHaveLength(1);
    // 200x200 = 40.000 m² + faixa externa do rastro (~5 m) + os 3/4 da base que ficam fora do quadrado
    expect(w.areaOf('ana')).toBeGreaterThan(40_000);
    expect(w.areaOf('ana')).toBeLessThan(47_000);
    expect(state.distance).toBeGreaterThan(780);
    expect(state.distance).toBeLessThan(820);
    // o centro do quadrado agora pertence à jogadora
    expect(await w.isInside('ana', offset(ORIGIN, 100, 100))).toBe(true);
  });

  it('ida e volta pelo mesmo caminho conquista só a faixa do rastro', async () => {
    const w = new TurfWorld();
    await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0], [0, 300], [0, 0]]));
    const a = w.areaOf('ana');
    expect(a).toBeGreaterThan(2800 + 2000);
    expect(a).toBeLessThan(2800 + 3500);
  });

  it('rastro não fechado ao fim da corrida é perdido', async () => {
    const w = new TurfWorld();
    const { events } = await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0], [0, 300], [300, 300]]));
    expect(ofType(events, 'capture')).toHaveLength(0);
    expect(ofType(events, 'trail_lost')).toHaveLength(1);
    expect(w.areaOf('ana')).toBeLessThan(2830);
  });

  it('preserva buracos que já existiam no território', async () => {
    const w = new TurfWorld();
    const outer = turf.circle([ORIGIN.lng, ORIGIN.lat], 150, { units: 'meters' }).geometry.coordinates[0];
    const hole = turf.circle([ORIGIN.lng, ORIGIN.lat], 50, { units: 'meters' }).geometry.coordinates[0].slice().reverse();
    w.set('ana', { type: 'MultiPolygon', coordinates: [[outer, hole]] });
    const before = w.areaOf('ana');
    // pequena conquista na borda leste
    await run(w, 'ana', pathFromMeters(ORIGIN, [[140, 0], [200, 0], [200, 60], [125, 60]]));
    expect(w.areaOf('ana')).toBeGreaterThan(before + 2000);
    expect(await w.isInside('ana', ORIGIN)).toBe(false); // o buraco central continua
  });
});

describe('laço longe do território', () => {
  it('cruzar o próprio rastro conquista o laço', async () => {
    const w = new TurfWorld();
    const pts = pathFromMeters(ORIGIN, [[0, 0], [500, 0], [700, 0], [700, 200], [605, 200], [605, -30]]);
    const { events } = await run(w, 'ana', pts);
    const loops = ofType(events, 'loop_capture');
    expect(loops).toHaveLength(1);
    // laço ≈ 95 x 200 = 19.000 m² + faixa
    expect(loops[0].area).toBeGreaterThan(19_000);
    expect(loops[0].area).toBeLessThan(23_000);
    expect(await w.isInside('ana', offset(ORIGIN, 650, 100))).toBe(true);
  });

  it('voltar perto do ponto onde o laço começou também fecha (sem cruzar)', async () => {
    const w = new TurfWorld();
    const pts = pathFromMeters(ORIGIN, [[0, 0], [400, 0], [600, 0], [600, 200], [415, 200], [415, 12]]);
    const { events } = await run(w, 'ana', pts);
    expect(ofType(events, 'loop_capture')).toHaveLength(1);
    expect(await w.isInside('ana', offset(ORIGIN, 500, 100))).toBe(true);
  });

  it('o primeiro território pode surgir de um laço mesmo sem base (base recortada a zero)', async () => {
    const w = new TurfWorld();
    // Território enorme de outra pessoa cobre a largada → base vazia
    w.set('bia', turfOps.toMulti(turf.circle([ORIGIN.lng, ORIGIN.lat], 100, { units: 'meters' }))!);
    const pts = pathFromMeters(ORIGIN, [[0, 0], [300, 0], [500, 0], [500, 200], [300, 200], [300, -20]]);
    const { events } = await run(w, 'ana', pts);
    expect(ofType(events, 'base')).toHaveLength(0);
    expect(ofType(events, 'loop_capture')).toHaveLength(1);
    expect(w.areaOf('ana')).toBeGreaterThan(40_000);
  });
});

describe('tomada de território', () => {
  it('conquista sobre área alheia retira a área do dono anterior', async () => {
    const w = new TurfWorld();
    await run(w, 'ana', pathFromMeters(ORIGIN, rectangle(0, 0, 200, 200)));
    const anaBefore = w.areaOf('ana');

    // Bia começa a oeste e fecha um retângulo que invade metade do quadrado da Ana
    const { events } = await run(w, 'bia', pathFromMeters(ORIGIN, [[-150, 100], [100, 100], [100, 300], [-150, 300], [-150, 100]]));
    const cap = ofType(events, 'capture');
    expect(cap).toHaveLength(1);
    const stolen = cap[0].stolen;
    expect(stolen).toHaveLength(1);
    expect(stolen[0].victimId).toBe('ana');
    expect(stolen[0].area).toBeGreaterThan(9_000);
    expect(w.areaOf('ana')).toBeCloseTo(anaBefore - stolen[0].area, -1);
    expect(overlap(w, 'ana', 'bia')).toBeLessThan(1);
    expect(await w.isInside('bia', offset(ORIGIN, 50, 150))).toBe(true);
    expect(await w.isInside('ana', offset(ORIGIN, 50, 150))).toBe(false);
    expect(await w.isInside('ana', offset(ORIGIN, 150, 50))).toBe(true);
  });

  it('cercar a ilha de outro jogador toma ela inteira', async () => {
    const w = new TurfWorld();
    await run(w, 'ana', pathFromMeters(ORIGIN, [[0, 0]])); // só a base de 30 m
    expect(w.areaOf('ana')).toBeGreaterThan(2700);
    await run(w, 'bia', pathFromMeters(ORIGIN, [[-200, -100], [100, -100], [100, 100], [-100, 100], [-100, -120]]));
    expect(w.get('ana')).toBeNull();
    expect(await w.isInside('bia', ORIGIN)).toBe(true);
  });
});

describe('filtros de GPS e pausa', () => {
  it('descarta ponto com precisão ruim e salto impossível', async () => {
    const w = new TurfWorld();
    const pts = pathFromMeters(ORIGIN, [[0, 0], [0, 50]]);
    const t = pts.at(-1)!.t;
    pts.push({ ...offset(ORIGIN, 0, 60), t: t + 3000, acc: 120 });
    pts.push({ ...offset(ORIGIN, 3000, 60), t: t + 4000, acc: 5 });
    const { state, events } = await run(w, 'ana', pts);
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual(['accuracy', 'speed']);
    expect(state.distance).toBeLessThan(55);
  });

  it('retomada longe do ponto de pausa quebra o rastro e não soma distância', async () => {
    const w = new TurfWorld();
    const tracker = new RunTracker(w);
    const s = newRunState();
    const events: RunEvent[] = [];
    for (const p of pathFromMeters(ORIGIN, [[0, 0], [0, 200]])) events.push(...(await tracker.step('ana', s, p)));
    const d = s.distance;
    tracker.pause(s);
    const later = pathFromMeters(ORIGIN, [[800, 200], [800, 250]], { startT: Date.UTC(2026, 10, 25, 10) });
    for (const p of later) events.push(...(await tracker.step('ana', s, p)));
    expect(ofType(events, 'trail_broken')).toHaveLength(1);
    expect(s.distance).toBeCloseTo(d + 50, 0);
  });
});
