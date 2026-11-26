// Implementação de World sobre PostgreSQL + PostGIS. Todas as operações rodam dentro da
// transação `tx`; as conquistas são serializadas por um advisory lock para manter a invariante
// "territórios não se sobrepõem" mesmo com vários corredores simultâneos.
//
// Escala: hoje o lock é global (simples e correto). Para muitos usuários, troque por locks por
// célula de grade (ex.: geohash das células tocadas pelo bbox da conquista).
import type { ClaimResult, LatLng, MultiPolygon, StolenPiece, World } from '@run-territory/engine';
import type { Tx } from './db';

const CLAIM_LOCK = 7_263_001;

export class PgWorld implements World {
  private locked = false;
  /** user ids cujo território mudou nesta transação (para avisar clientes via WebSocket). */
  readonly changed = new Set<string>();

  constructor(private tx: Tx) {}

  private async lock() {
    if (this.locked) return;
    await this.tx.query('SELECT pg_advisory_xact_lock($1)', [CLAIM_LOCK]);
    this.locked = true;
  }

  async isInside(userId: string, p: LatLng) {
    const { rows } = await this.tx.query(
      `SELECT EXISTS (SELECT 1 FROM territories
         WHERE user_id = $1 AND ST_Intersects(geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))) AS inside`,
      [userId, p.lng, p.lat],
    );
    return rows[0].inside as boolean;
  }

  async claimBase(userId: string, c: LatLng, radiusM: number) {
    await this.lock();
    const { rows } = await this.tx.query(
      `WITH circle AS (
         SELECT ST_Buffer(ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, 'quad_segs=8')::geometry AS g
       ),
       others AS (
         SELECT ST_Union(t.geom) AS g FROM territories t, circle
         WHERE t.user_id <> $1 AND t.geom && circle.g
       )
       SELECT ST_AsGeoJSON(rt_clean(CASE WHEN others.g IS NULL THEN circle.g ELSE ST_Difference(circle.g, others.g) END)) AS region
       FROM circle, others
       WHERE NOT EXISTS (SELECT 1 FROM territories WHERE user_id = $1)`,
      [userId, c.lng, c.lat, radiusM],
    );
    const region = rows[0]?.region;
    return region ? this.commit(userId, region, false) : null;
  }

  async claimPath(userId: string, path: LatLng[], halfWidthM: number) {
    await this.lock();
    const line = { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) };
    const { rows } = await this.tx.query(
      `WITH own AS (SELECT (SELECT geom FROM territories WHERE user_id = $1) AS g),
       strip AS (
         SELECT ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography, $3, 'quad_segs=2')::geometry AS g
       ),
       filled AS (
         SELECT rt_fill_new_holes(rt_clean(CASE WHEN own.g IS NULL THEN strip.g ELSE ST_Union(own.g, strip.g) END), own.g) AS g, own.g AS own
         FROM own, strip
       )
       SELECT ST_AsGeoJSON(rt_clean(CASE WHEN own IS NULL THEN g ELSE ST_Difference(g, own) END)) AS region FROM filled`,
      [userId, JSON.stringify(line), halfWidthM],
    );
    const region = rows[0]?.region;
    return region ? this.commit(userId, region, true) : null;
  }

  /** Incorpora a região (GeoJSON string) ao território do jogador, tomando-a de quem a possuía. */
  private async commit(userId: string, regionJson: string, steal: boolean): Promise<ClaimResult | null> {
    const { rows: g } = await this.tx.query(
      `SELECT ST_Area(ST_GeomFromGeoJSON($1)::geography) AS area`,
      [regionJson],
    );
    const gainedArea = g[0].area as number;
    if (!(gainedArea >= 1)) return null;

    const stolen: StolenPiece[] = [];
    if (steal) {
      const { rows: victims } = await this.tx.query(
        `WITH r AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS g)
         SELECT t.user_id,
                ST_AsGeoJSON(rt_clean(ST_Intersection(t.geom, r.g))) AS taken,
                ST_AsText(rt_clean(ST_Difference(t.geom, r.g))) AS remaining
         FROM territories t, r
         WHERE t.user_id <> $1 AND t.geom && r.g AND ST_Intersects(t.geom, r.g)
         FOR UPDATE OF t`,
        [userId, regionJson],
      );
      for (const v of victims) {
        if (!v.taken) continue;
        const { rows: a } = await this.tx.query('SELECT ST_Area(ST_GeomFromGeoJSON($1)::geography) AS area', [v.taken]);
        if (a[0].area < 1) continue;
        if (v.remaining) {
          await this.tx.query(
            `UPDATE territories SET geom = ST_GeomFromText($2, 4326), area_m2 = ST_Area(ST_GeomFromText($2, 4326)::geography), updated_at = now()
             WHERE user_id = $1`,
            [v.user_id, v.remaining],
          );
        } else {
          await this.tx.query('DELETE FROM territories WHERE user_id = $1', [v.user_id]);
        }
        this.changed.add(v.user_id);
        stolen.push({ victimId: v.user_id, area: a[0].area, geom: JSON.parse(v.taken) as MultiPolygon });
      }
    }

    await this.tx.query(
      `WITH r AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS g),
       merged AS (
         SELECT rt_clean(CASE WHEN t.geom IS NULL THEN r.g ELSE ST_Union(t.geom, r.g) END) AS g
         FROM r LEFT JOIN territories t ON t.user_id = $1
       )
       INSERT INTO territories (user_id, geom, area_m2)
       SELECT $1, merged.g, ST_Area(merged.g::geography) FROM merged
       ON CONFLICT (user_id) DO UPDATE SET geom = EXCLUDED.geom, area_m2 = EXCLUDED.area_m2, updated_at = now()`,
      [userId, regionJson],
    );
    this.changed.add(userId);
    return { gainedArea, gainedGeom: JSON.parse(regionJson) as MultiPolygon, stolen };
  }
}
