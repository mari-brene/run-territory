// Gera trajetos de GPS sintéticos a partir de waypoints em metros (leste, norte) — usado em
// testes, no script de simulação do servidor e no "modo simulação" do app.
import { offset } from './geo';
import type { GpsPoint, LatLng } from './types';

export function pathFromMeters(
  origin: LatLng,
  waypoints: [number, number][],
  opts: { stepM?: number; speedMps?: number; startT?: number } = {},
): GpsPoint[] {
  const stepM = opts.stepM ?? 10;
  const speed = opts.speedMps ?? 3;
  let t = opts.startT ?? Date.UTC(2026, 10, 25, 9, 0, 0);
  const out: GpsPoint[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const [x0, y0] = waypoints[i];
    if (i === 0) {
      out.push({ ...offset(origin, x0, y0), t, acc: 5 });
      continue;
    }
    const [xp, yp] = waypoints[i - 1];
    const len = Math.hypot(x0 - xp, y0 - yp);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 1; k <= n; k++) {
      const x = xp + ((x0 - xp) * k) / n;
      const y = yp + ((y0 - yp) * k) / n;
      t += ((len / n) / speed) * 1000;
      out.push({ ...offset(origin, x, y), t: Math.round(t), acc: 5 });
    }
  }
  return out;
}

/** Retângulo (em metros) começando e terminando em (x, y). */
export function rectangle(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
}
