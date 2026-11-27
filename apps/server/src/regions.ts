// Importa bairros/regiões para as disputas por bairro.
//
//   npm run regions -w @run-territory/server -- --file bairros.geojson --city "São Paulo" [--name-prop NOME] [--kind bairro]
//   npm run regions -w @run-territory/server -- --demo [--center -23.5874,-46.6576] [--city Demo] [--size 600] [--grid 3]
//
// O arquivo é um GeoJSON (FeatureCollection) com polígonos. Veja docs/BAIRROS.md para onde baixar.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { createPool, withTx, type Db } from './db';
import { migrate } from './migrate';

export interface RegionInput {
  name: string;
  city: string;
  kind: string;
  geometry: unknown; // GeoJSON Polygon ou MultiPolygon
}

/** Insere ou atualiza (por nome + cidade). Geometrias inválidas são corrigidas; as vazias, ignoradas. */
export async function upsertRegions(db: Db, regions: RegionInput[]) {
  let saved = 0;
  await withTx(db, async (tx) => {
    for (const r of regions) {
      const { rowCount } = await tx.query(
        `WITH g AS (
           SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($4)), 4326)), 3)) AS geom
         )
         INSERT INTO regions (name, city, kind, geom, area_m2)
         SELECT $1, $2, $3, g.geom, ST_Area(g.geom::geography) FROM g WHERE NOT ST_IsEmpty(g.geom)
         ON CONFLICT (name, city) DO UPDATE SET kind = EXCLUDED.kind, geom = EXCLUDED.geom, area_m2 = EXCLUDED.area_m2`,
        [r.name, r.city, r.kind, JSON.stringify(r.geometry)],
      );
      saved += rowCount ?? 0;
    }
  });
  return saved;
}

/** Lê um GeoJSON e devolve as regiões com nome. */
export function regionsFromGeoJson(fc: any, opts: { city: string; kind: string; nameProp?: string }): RegionInput[] {
  const features: any[] = fc?.type === 'FeatureCollection' ? fc.features : fc?.type === 'Feature' ? [fc] : [];
  const out: RegionInput[] = [];
  for (const f of features) {
    const t = f?.geometry?.type;
    if (t !== 'Polygon' && t !== 'MultiPolygon') continue;
    const p = f.properties ?? {};
    const name = String((opts.nameProp ? p[opts.nameProp] : p.name ?? p.nome ?? p.NOME ?? p.NM_BAIRRO ?? p.NOME_DIST) ?? '').trim();
    if (!name) continue;
    out.push({ name, city: opts.city, kind: opts.kind, geometry: f.geometry });
  }
  return out;
}

/** Grade de quadrados ("Setor A1", "Setor A2"...) para testar sem dados reais de bairros. */
export function demoGrid(center: { lat: number; lng: number }, sizeM: number, n: number, city: string): RegionInput[] {
  const dLat = sizeM / 111_320;
  const dLng = sizeM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const out: RegionInput[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const lat0 = center.lat + (i - n / 2) * dLat;
      const lng0 = center.lng + (j - n / 2) * dLng;
      const ring = [
        [lng0, lat0],
        [lng0 + dLng, lat0],
        [lng0 + dLng, lat0 + dLat],
        [lng0, lat0 + dLat],
        [lng0, lat0],
      ];
      out.push({ name: `Setor ${String.fromCharCode(65 + i)}${j + 1}`, city, kind: 'setor', geometry: { type: 'Polygon', coordinates: [ring] } });
    }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name: string, def?: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : def;
  };
  const db = createPool(config.databaseUrl, { ssl: config.databaseSsl });
  try {
    await migrate(db);
    let regions: RegionInput[];
    if (process.argv.includes('--demo')) {
      const [lat, lng] = arg('center', '-23.5874,-46.6576')!.split(',').map(Number);
      regions = demoGrid({ lat, lng }, Number(arg('size', '600')), Number(arg('grid', '3')), arg('city', 'Demo')!);
    } else {
      const file = arg('file');
      if (!file) throw new Error('use --file arquivo.geojson --city "Cidade" (ou --demo)');
      const fc = JSON.parse(await readFile(file, 'utf8'));
      regions = regionsFromGeoJson(fc, { city: arg('city', '')!, kind: arg('kind', 'bairro')!, nameProp: arg('name-prop') });
    }
    const saved = await upsertRegions(db, regions);
    console.log(`${saved} regiões salvas (de ${regions.length} encontradas).`);
  } catch (e: any) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
