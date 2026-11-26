// Utilitários geoespaciais em TypeScript puro (sem dependências), usados pelo motor
// e pelo app. GeoJSON usa [lng, lat] (WGS84).
import type { LatLng } from './types';

const R = 6371008.8; // raio médio da Terra (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Distância haversine em metros. */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface XY {
  x: number;
  y: number;
}

/** Projeção local equiretangular (metros) em torno de uma origem — precisa em escala de cidade. */
export function localProjector(origin: LatLng) {
  const k = Math.cos(rad(origin.lat));
  return {
    toXY: (p: LatLng): XY => ({ x: rad(p.lng - origin.lng) * R * k, y: rad(p.lat - origin.lat) * R }),
    toLL: (q: XY): LatLng => ({
      lng: origin.lng + (q.x / (R * k)) * (180 / Math.PI),
      lat: origin.lat + (q.y / R) * (180 / Math.PI),
    }),
  };
}

/** Interseção dos segmentos planares p1-p2 e p3-p4. */
export function segmentIntersection(p1: XY, p2: XY, p3: XY, p4: XY): XY | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

/** Desloca um ponto em metros (leste, norte). Útil para testes e simulação. */
export function offset(origin: LatLng, eastM: number, northM: number): LatLng {
  return localProjector(origin).toLL({ x: eastM, y: northM });
}
