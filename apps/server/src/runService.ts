// Ciclo de vida das corridas: iniciar, receber pontos de GPS (processando conquistas no
// servidor, que é a autoridade), pausar, retomar e finalizar.
import { RunTracker, newRunState, runXp, type GpsPoint, type RunEvent, type RunState } from '@run-territory/engine';
import { withTx, type Db, type Tx } from './db';
import { PgWorld } from './pgWorld';
import type { Hub } from './realtime';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PublicEvent {
  type: RunEvent['type'];
  area?: number;
  geom?: unknown;
  stolen?: { victimId: string; username: string; area: number }[];
  reason?: string;
}

export interface RunStats {
  distanceM: number;
  movingTimeS: number;
  areaGainedM2: number;
  areaStolenM2: number;
  captures: number;
}

export class RunService {
  constructor(
    private db: Db,
    private hub?: Hub,
  ) {}

  async start(userId: string) {
    const open = await this.db.query(`SELECT * FROM runs WHERE user_id = $1 AND status <> 'finished'`, [userId]);
    if (open.rows[0]) return toRun(open.rows[0]);
    const { rows } = await this.db.query(
      `INSERT INTO runs (user_id, status, state) VALUES ($1, 'active', $2) RETURNING *`,
      [userId, JSON.stringify(newRunState())],
    );
    return toRun(rows[0]);
  }

  private async lockRun(tx: Tx, userId: string, runId: string) {
    const { rows } = await tx.query('SELECT * FROM runs WHERE id = $1 AND user_id = $2 FOR UPDATE', [runId, userId]);
    if (!rows[0]) throw new HttpError(404, 'corrida não encontrada');
    return rows[0];
  }

  async addPoints(userId: string, runId: string, points: GpsPoint[]) {
    const world = { current: null as PgWorld | null };
    const result = await withTx(this.db, async (tx) => {
      const run = await this.lockRun(tx, userId, runId);
      if (run.status === 'finished') throw new HttpError(409, 'corrida já finalizada');
      if (run.status === 'paused') throw new HttpError(409, 'corrida pausada');
      const state = run.state as RunState;
      const w = new PgWorld(tx);
      world.current = w;
      const tracker = new RunTracker(w);
      const { rows: seqRows } = await tx.query('SELECT coalesce(max(seq), -1) AS s FROM run_points WHERE run_id = $1', [runId]);
      let seq = seqRows[0].s as number;

      const events: RunEvent[] = [];
      const sorted = [...points].sort((a, b) => a.t - b.t);
      for (const p of sorted) {
        const before = state.accepted;
        const ev = await tracker.step(userId, state, p);
        events.push(...ev);
        await tx.query(
          'INSERT INTO run_points (run_id, seq, lat, lng, t, acc, accepted) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7)',
          [runId, ++seq, p.lat, p.lng, p.t, p.acc ?? null, state.accepted > before],
        );
      }

      const stats = await this.recordEvents(tx, userId, runId, events);
      const last = state.last;
      await tx.query(
        `UPDATE runs SET state = $2, distance_m = $3, moving_time_s = $4,
           area_gained_m2 = area_gained_m2 + $5, area_stolen_m2 = area_stolen_m2 + $6, captures = captures + $7,
           last_point = CASE WHEN $8::float8 IS NULL THEN last_point ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END,
           last_point_at = CASE WHEN $8::float8 IS NULL THEN last_point_at ELSE now() END
         WHERE id = $1`,
        [runId, JSON.stringify(state), state.distance, state.movingTime, stats.gained, stats.stolen, stats.captures, last?.lat ?? null, last?.lng ?? null],
      );
      const { rows: u } = await tx.query('SELECT username, color FROM users WHERE id = $1', [userId]);
      return { state, events, user: u[0] };
    });

    const { state, events, user } = result;
    const publicEvents = await this.publicEvents(events);
    // Tempo real: avisa todos sobre mudanças de território e posição do corredor.
    if (this.hub) {
      const changed = [...(world.current?.changed ?? [])];
      if (changed.length) this.hub.broadcast({ type: 'territories_changed', userIds: changed, by: userId });
      for (const e of publicEvents)
        for (const s of e.stolen ?? [])
          this.hub.sendTo(s.victimId, { type: 'territory_lost', userId: s.victimId, by: userId, byUsername: user.username, area: s.area });
      if (state.last)
        this.hub.broadcast({
          type: 'runner',
          userId,
          username: user.username,
          color: user.color,
          lat: state.last.lat,
          lng: state.last.lng,
          trail: state.trail.map((p) => [p.lng, p.lat]),
        });
    }
    return {
      events: publicEvents.filter((e) => e.type !== 'rejected'),
      rejected: events.filter((e) => e.type === 'rejected').length,
      trail: state.trail.map((p) => [p.lng, p.lat]),
      stats: { distanceM: state.distance, movingTimeS: state.movingTime },
    };
  }

  private async recordEvents(tx: Tx, userId: string, runId: string, events: RunEvent[]) {
    let gained = 0;
    let stolenTotal = 0;
    let captures = 0;
    for (const e of events) {
      if (e.type !== 'base' && e.type !== 'capture' && e.type !== 'loop_capture') continue;
      gained += e.area;
      if (e.type !== 'base') captures++;
      await tx.query(
        `INSERT INTO conquest_events (run_id, user_id, kind, area_m2, geom) VALUES ($1, $2, $3, $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)))`,
        [runId, userId, e.type, e.area, JSON.stringify(e.geom)],
      );
      for (const s of e.stolen) {
        stolenTotal += s.area;
        await tx.query(
          `INSERT INTO conquest_events (run_id, user_id, victim_id, kind, area_m2, geom) VALUES ($1, $2, $3, 'steal', $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)))`,
          [runId, userId, s.victimId, s.area, JSON.stringify(s.geom)],
        );
      }
    }
    return { gained, stolen: stolenTotal, captures };
  }

  private async publicEvents(events: RunEvent[]): Promise<PublicEvent[]> {
    const ids = new Set<string>();
    for (const e of events) if ('stolen' in e) for (const s of e.stolen) ids.add(s.victimId);
    const names = new Map<string, string>();
    if (ids.size) {
      const { rows } = await this.db.query('SELECT id, username FROM users WHERE id = ANY($1)', [[...ids]]);
      for (const r of rows) names.set(r.id, r.username);
    }
    return events.map((e) => {
      if ('stolen' in e)
        return {
          type: e.type,
          area: e.area,
          geom: e.geom,
          stolen: e.stolen.map((s) => ({ victimId: s.victimId, username: names.get(s.victimId) ?? '?', area: s.area })),
        };
      return { ...e } as PublicEvent;
    });
  }

  async pause(userId: string, runId: string) {
    return withTx(this.db, async (tx) => {
      const run = await this.lockRun(tx, userId, runId);
      if (run.status !== 'active') throw new HttpError(409, 'corrida não está ativa');
      const state = run.state as RunState;
      new RunTracker(new PgWorld(tx)).pause(state);
      const { rows } = await tx.query(`UPDATE runs SET status = 'paused', state = $2 WHERE id = $1 RETURNING *`, [runId, JSON.stringify(state)]);
      return toRun(rows[0]);
    });
  }

  async resume(userId: string, runId: string) {
    return withTx(this.db, async (tx) => {
      const run = await this.lockRun(tx, userId, runId);
      if (run.status !== 'paused') throw new HttpError(409, 'corrida não está pausada');
      const { rows } = await tx.query(`UPDATE runs SET status = 'active' WHERE id = $1 RETURNING *`, [runId]);
      return toRun(rows[0]);
    });
  }

  async finish(userId: string, runId: string) {
    const out = await withTx(this.db, async (tx) => {
      const run = await this.lockRun(tx, userId, runId);
      if (run.status === 'finished') return { run: toRun(run), events: [] as RunEvent[] };
      const state = run.state as RunState;
      const events = new RunTracker(new PgWorld(tx)).finish(state);
      const { rows: st } = await tx.query(`SELECT count(*)::int AS n FROM conquest_events WHERE run_id = $1 AND kind = 'steal'`, [runId]);
      const xp = runXp(run.distance_m, run.area_gained_m2, st[0].n);
      const { rows } = await tx.query(
        `UPDATE runs SET status = 'finished', ended_at = now(), state = $2, xp_earned = $3 WHERE id = $1 RETURNING *`,
        [runId, JSON.stringify(state), xp],
      );
      await tx.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [userId, xp]);
      return { run: toRun(rows[0]), events };
    });
    this.hub?.broadcast({ type: 'runner_stopped', userId });
    return { ...out.run, trailLost: out.events.some((e) => e.type === 'trail_lost') };
  }
}

export function toRun(r: any) {
  return {
    id: r.id as string,
    status: r.status as 'active' | 'paused' | 'finished',
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceM: r.distance_m as number,
    movingTimeS: r.moving_time_s as number,
    areaGainedM2: r.area_gained_m2 as number,
    areaStolenM2: r.area_stolen_m2 as number,
    captures: r.captures as number,
    xpEarned: r.xp_earned as number,
    trail: ((r.state?.trail ?? []) as GpsPoint[]).map((p) => [p.lng, p.lat]),
  };
}
