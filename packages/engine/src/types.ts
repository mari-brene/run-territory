import type { MultiPolygon } from 'geojson';
export type { MultiPolygon };

/** Ponto de GPS. t = epoch em ms, acc = precisão horizontal em metros. */
export interface GpsPoint {
  lat: number;
  lng: number;
  t: number;
  acc?: number | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StolenPiece {
  victimId: string;
  area: number;
  geom: MultiPolygon;
}

export interface ClaimResult {
  gainedArea: number;
  gainedGeom: MultiPolygon;
  stolen: StolenPiece[];
}

/**
 * Onde os territórios vivem. O motor de corrida só conversa com esta interface,
 * então a mesma regra roda em memória (testes / pré-visualização no app com Turf)
 * e no servidor (PostgreSQL + PostGIS, transacional).
 */
export interface World {
  /** O ponto está dentro do território do jogador? */
  isInside(userId: string, p: LatLng): Promise<boolean>;
  /** Base inicial: círculo recortado pelos territórios alheios (não rouba). */
  claimBase(userId: string, center: LatLng, radiusM: number): Promise<ClaimResult | null>;
  /**
   * Conquista a área fechada por `path` junto ao território atual: a faixa do rastro
   * (meia-largura halfWidthM) + todo buraco NOVO formado em território ∪ faixa.
   * A área conquistada é retirada de quem a possuía.
   */
  claimPath(userId: string, path: LatLng[], halfWidthM: number): Promise<ClaimResult | null>;
}

export type RunEvent =
  | { type: 'base' | 'capture' | 'loop_capture'; area: number; geom: MultiPolygon; stolen: StolenPiece[] }
  | { type: 'trail_start' }
  | { type: 'trail_broken'; reason: string }
  | { type: 'trail_lost'; length: number }
  | { type: 'rejected'; reason: 'accuracy' | 'speed' | 'time' };

export interface RunState {
  trail: GpsPoint[];
  trailLen: number[];
  last: GpsPoint | null;
  lastInside: boolean;
  resumed: boolean;
  distance: number;
  movingTime: number;
  accepted: number;
  rejected: number;
  baseChecked: boolean;
}
