// Máquina de estados da corrida + regras de conquista (estilo "paper.io" adaptado a GPS real).
//
// Regras:
//  1. Na primeira corrida, o jogador recebe uma BASE circular no ponto de partida, recortada
//     pelos territórios alheios (a base nunca rouba área).
//  2. Ao SAIR do próprio território, o jogador passa a desenhar um RASTRO.
//  3. Ao VOLTAR ao território, conquista a faixa do rastro + toda área que ficou fechada entre
//     o rastro e o território (os "buracos novos" de território ∪ faixa).
//  4. Fechar um LAÇO com o próprio rastro (cruzá-lo, ou voltar a menos de LOOP_CLOSE_M de um
//     ponto dele após LOOP_MIN_PATH_M) também conquista a área do laço — permite expandir longe da base.
//  5. Toda área conquistada é retirada de quem a possuía (tomada de território). Invariante:
//     territórios de jogadores diferentes nunca se sobrepõem.
//  6. Rastro não fechado ao fim da corrida é perdido.
//  7. Filtros de GPS: precisão ruim, saltos impossíveis (velocidade > MAX_SPEED_MPS) e micro-movimentos.
import { distance, localProjector, segmentIntersection } from './geo';
import type { GpsPoint, LatLng, RunEvent, RunState, World } from './types';

export const RULES = {
  BASE_RADIUS_M: 30,
  TRAIL_HALF_WIDTH_M: 5, // o rastro conquistado vira uma faixa de 10 m
  LOOP_CLOSE_M: 20,
  LOOP_MIN_PATH_M: 150,
  MAX_ACCURACY_M: 35,
  MIN_STEP_M: 3,
  MAX_SPEED_MPS: 12.5, // ~45 km/h
  RESUME_BREAK_M: 200,
  MAX_MOVING_DT_S: 60,
};
export type Rules = typeof RULES;

export function newRunState(): RunState {
  return {
    trail: [],
    trailLen: [],
    last: null,
    lastInside: false,
    resumed: false,
    distance: 0,
    movingTime: 0,
    accepted: 0,
    rejected: 0,
    baseChecked: false,
  };
}

export class RunTracker {
  readonly rules: Rules;
  constructor(
    private world: World,
    rules: Partial<Rules> = {},
  ) {
    this.rules = { ...RULES, ...rules };
  }

  /** Processa um ponto de GPS e devolve os eventos gerados. `state` é mutado. */
  async step(userId: string, state: RunState, p: GpsPoint): Promise<RunEvent[]> {
    const r = this.rules;
    const events: RunEvent[] = [];

    if (p.acc != null && p.acc > r.MAX_ACCURACY_M) {
      state.rejected++;
      return [{ type: 'rejected', reason: 'accuracy' }];
    }
    if (state.last && p.t < state.last.t) {
      state.rejected++;
      return [{ type: 'rejected', reason: 'time' }];
    }

    if (!state.baseChecked) {
      state.baseChecked = true;
      const base = await this.world.claimBase(userId, p, r.BASE_RADIUS_M);
      if (base) events.push({ type: 'base', area: base.gainedArea, geom: base.gainedGeom, stolen: [] });
    }

    if (state.last) {
      const d = distance(state.last, p);
      const dt = (p.t - state.last.t) / 1000;
      if (state.resumed) {
        // Retomada após pausa: o deslocamento durante a pausa não conta.
        state.resumed = false;
        if (d > r.RESUME_BREAK_M && state.trail.length) {
          events.push({ type: 'trail_broken', reason: 'resume_jump' });
          this.resetTrail(state);
        } else if (state.trail.length) {
          this.pushTrail(state, p);
        }
        state.last = p;
        state.lastInside = await this.world.isInside(userId, p);
        state.accepted++;
        return events;
      }
      if (d < r.MIN_STEP_M) return events;
      if (dt <= 0 || d / dt > r.MAX_SPEED_MPS) {
        state.rejected++;
        events.push({ type: 'rejected', reason: 'speed' });
        return events;
      }
      state.distance += d;
      state.movingTime += Math.min(dt, r.MAX_MOVING_DT_S);
    }
    state.accepted++;

    const inside = await this.world.isInside(userId, p);

    if (!state.trail.length) {
      if (!inside) {
        // Saiu do território (ou começou fora): o rastro começa no último ponto dentro dele.
        const start = state.last && state.lastInside ? state.last : p;
        this.pushTrail(state, start);
        if (start !== p) this.pushTrail(state, p);
        events.push({ type: 'trail_start' });
      }
    } else if (inside) {
      // Voltou ao território: fecha a área.
      this.pushTrail(state, p);
      const res = await this.world.claimPath(userId, state.trail, r.TRAIL_HALF_WIDTH_M);
      if (res) events.push({ type: 'capture', area: res.gainedArea, geom: res.gainedGeom, stolen: res.stolen });
      this.resetTrail(state);
    } else {
      this.pushTrail(state, p);
      const loop = this.detectLoop(state);
      if (loop) {
        const res = await this.world.claimPath(userId, loop, r.TRAIL_HALF_WIDTH_M);
        if (res) events.push({ type: 'loop_capture', area: res.gainedArea, geom: res.gainedGeom, stolen: res.stolen });
        this.resetTrail(state);
        if (!(await this.world.isInside(userId, p))) {
          this.pushTrail(state, p);
          events.push({ type: 'trail_start' });
        }
      }
    }

    state.last = p;
    state.lastInside = await this.world.isInside(userId, p);
    return events;
  }

  /** Pausa: o próximo ponto aceito não soma distância nem tempo. */
  pause(state: RunState) {
    state.resumed = true;
  }

  /** Fim da corrida: rastro aberto é perdido. */
  finish(state: RunState): RunEvent[] {
    const events: RunEvent[] = [];
    if (state.trail.length > 1) events.push({ type: 'trail_lost', length: state.trailLen[state.trailLen.length - 1] });
    this.resetTrail(state);
    return events;
  }

  private pushTrail(state: RunState, p: GpsPoint) {
    const n = state.trail.length;
    state.trailLen.push(n ? state.trailLen[n - 1] + distance(state.trail[n - 1], p) : 0);
    state.trail.push({ lat: p.lat, lng: p.lng, t: p.t });
  }

  private resetTrail(state: RunState) {
    state.trail = [];
    state.trailLen = [];
  }

  /** O último segmento do rastro fecha um laço? Devolve o caminho fechado do laço. */
  detectLoop(state: RunState): LatLng[] | null {
    const tr = state.trail;
    const n = tr.length;
    if (n < 4) return null;
    const proj = localProjector(tr[n - 1]);
    const a = proj.toXY(tr[n - 2]);
    const b = proj.toXY(tr[n - 1]);
    // 1) cruzou o próprio rastro
    for (let i = 0; i < n - 3; i++) {
      const x = segmentIntersection(proj.toXY(tr[i]), proj.toXY(tr[i + 1]), a, b);
      if (x) {
        const X = proj.toLL(x);
        return [X, ...tr.slice(i + 1, n - 1), X];
      }
    }
    // 2) voltou perto de um ponto antigo do rastro depois de percorrer um laço razoável
    const total = state.trailLen[n - 1];
    for (let i = 0; i < n - 2; i++) {
      if (total - state.trailLen[i] < this.rules.LOOP_MIN_PATH_M) break;
      if (distance(tr[i], tr[n - 1]) <= this.rules.LOOP_CLOSE_M) return [...tr.slice(i, n), tr[i]];
    }
    return null;
  }
}
