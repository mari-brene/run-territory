import { buildApp } from './app';
import { config } from './config';
import { createPool } from './db';
import { migrate } from './migrate';

const db = createPool(config.databaseUrl);
await migrate(db);
const app = buildApp(db, { logger: true });
await app.listen({ port: config.port, host: config.host });
