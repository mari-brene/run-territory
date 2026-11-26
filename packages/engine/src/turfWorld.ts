// Implementação de World em memória usando Turf.js. Serve para testes, para a
// pré-visualização no app e como especificação executável do que o PostGIS faz no servidor.
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ClaimResult, LatLng, StolenPiece, World } from './types';

type Geo = MultiPolygon | Polygon;

export function toMulti(g: Feature<any> | Geo | null | undefined): MultiPolygon | null {
  if (!g) return null;
  const geom: any = (g as Feature).type === 'Feature' ? (g as Feature).geometry : g;
  if (!geom) return null;
  if (geom.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [geom.coordinates] };
  if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.coordinates };
  return null;
}

/** Remove fragmentos e buracos menores que minArea (m²). */
export function clean(g: Feature<any> | Geo | null | undefined, minArea = 1): MultiPolygon | null {
  const m = toMulti(g);
  if (!m) return null;
  const polys: number[][][][] = [];
  for (const poly of m.coordinates) {
    if (turf.area(turf.polygon([poly[0]])) < minArea) continue;
    polys.push([poly[0], ...poly.slice(1).filter((h) => turf.area(turf.polygon([h])) >= minArea)]);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

export const area = (g: Geo | null) => (g ? turf.area(g) : 0);
const f = (g: Geo) => turf.feature(g);

export function union(a: Geo | null, b: Geo | null): MultiPolygon | null {
  if (!a) return clean(b);
  if (!b) return clean(a);
  return clean(turf.union(turf.featureCollection([f(a), f(b)])));
}
export function difference(a: Geo | null, b: Geo | null): MultiPolygon | null {
  if (!a) return null;
  if (!b) return clean(a);
  return clean(turf.difference(turf.featureCollection([f(a), f(b)])));
}
export function intersect(a: Geo | null, b: Geo | null): MultiPolygon | null {
  if (!a || !b || !bboxOverlap(turf.bbox(a), turf.bbox(b))) return null;
  return clean(turf.intersect(turf.featureCollection([f(a), f(b)])));
}
export function bboxOverlap(a: number[], b: number[]) {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

export function bufferLine(path: LatLng[], halfWidthM: number): MultiPolygon | null {
  const coords = path.map((p) => [p.lng, p.lat]);
  const g = turf.buffer(turf.lineString(coords), halfWidthM, { units: 'meters', steps: 6 });
  return clean(g as Feature<Polygon>);
}

/** Preenche os buracos de `g` que não estão (quase) inteiramente dentro de buracos de `previous`. */
export function fillNewHoles(g: MultiPolygon | null, previous: MultiPolygon | null): MultiPolygon | null {
  if (!g) return null;
  const oldHoles: Polygon[] = [];
  for (const poly of previous?.coordinates ?? []) for (const h of poly.slice(1)) oldHoles.push({ type: 'Polygon', coordinates: [h] });
  let out: MultiPolygon | null = null;
  for (const poly of g.coordinates) {
    const keep = [poly[0]];
    for (const h of poly.slice(1)) {
      const hole: Polygon = { type: 'Polygon', coordinates: [h] };
      const ha = turf.area(hole);
      const isOld = oldHoles.some((oh) => area(intersect(hole, oh)) / ha > 0.98);
      if (isOld) keep.push(h);
    }
    out = union(out, { type: 'Polygon', coordinates: keep });
  }
  return out;
}

export class TurfWorld implements World {
  readonly territories = new Map<string, MultiPolygon>();

  get(userId: string) {
    return this.territories.get(userId) ?? null;
  }
  set(userId: string, g: MultiPolygon | null) {
    if (g) this.territories.set(userId, g);
    else this.territories.delete(userId);
  }
  areaOf(userId: string) {
    return area(this.get(userId));
  }

  async isInside(userId: string, p: LatLng) {
    const g = this.get(userId);
    return !!g && turf.booleanPointInPolygon([p.lng, p.lat], g);
  }

  async claimBase(userId: string, center: LatLng, radiusM: number) {
    if (this.get(userId)) return null;
    let region = toMulti(turf.circle([center.lng, center.lat], radiusM, { units: 'meters', steps: 32 }));
    for (const [uid, g] of this.territories) if (uid !== userId) region = difference(region, g);
    return this.commit(userId, region, false);
  }

  async claimPath(userId: string, path: LatLng[], halfWidthM: number) {
    const own = this.get(userId);
    const merged = union(own, bufferLine(path, halfWidthM));
    const filled = fillNewHoles(merged, own);
    return this.commit(userId, difference(filled, own), true);
  }

  private commit(userId: string, gained: MultiPolygon | null, steal: boolean): ClaimResult | null {
    if (!gained || area(gained) < 1) return null;
    const stolen: StolenPiece[] = [];
    if (steal) {
      for (const [uid, g] of [...this.territories]) {
        if (uid === userId) continue;
        const taken = intersect(g, gained);
        if (!taken || area(taken) < 1) continue;
        this.set(uid, difference(g, gained));
        stolen.push({ victimId: uid, area: area(taken), geom: taken });
      }
    }
    this.set(userId, union(this.get(userId), gained));
    return { gainedArea: area(gained), gainedGeom: gained, stolen };
  }
}
