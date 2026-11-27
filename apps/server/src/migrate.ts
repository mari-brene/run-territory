import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config';
import { createPool, withTx, type Db } from './db';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await withTx(db, async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`migração aplicada: ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createPool(config.databaseUrl, { ssl: config.databaseSsl });
  migrate(db)
    .then(() => db.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
