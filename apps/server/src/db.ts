import pg from 'pg';

// timestamptz como string ISO e números double como number
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, opts: { ssl?: boolean } = {}): Db {
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Provedores gerenciados usam certificados próprios; a conexão continua criptografada.
    ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
  });
  // Sem isso, uma conexão ociosa derrubada pelo provedor derruba o servidor inteiro.
  pool.on('error', (e) => console.error('erro no pool do banco:', e.message));
  return pool;
}

export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
