import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { buildApp } from './app';
import { config } from './config';
import { createPool } from './db';
import { migrate } from './migrate';

const db = createPool(config.databaseUrl);
await migrate(db);
const app = buildApp(db, { logger: true });
await app.listen({ port: config.port, host: config.host });

// Mostra os endereços que o celular (no mesmo Wi-Fi) pode usar em "Configurar servidor".
const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i!.address}:${config.port}`);
console.log(`\n  Run Territory no ar!\n  Neste computador: http://localhost:${config.port}`);
if (existsSync('/.dockerenv')) {
  // Dentro do Docker o IP abaixo seria o do contêiner, não o do computador.
  console.log(`  No celular (mesmo Wi-Fi), use http://IP-DO-SEU-COMPUTADOR:${config.port} (veja o guia para achar o IP)\n`);
} else if (lan.length) {
  console.log(`  No celular (mesmo Wi-Fi), use: ${lan.join('  ou  ')}\n`);
}
