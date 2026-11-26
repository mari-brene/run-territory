import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { buildApp } from './app';
import { assertProductionConfig, config } from './config';
import { createPool } from './db';
import { migrate } from './migrate';

assertProductionConfig();
const db = createPool(config.databaseUrl, { ssl: config.databaseSsl });
await migrate(db);
const app = buildApp(db, { logger: true });
await app.listen({ port: config.port, host: config.host });

// Desliga com calma quando a plataforma de deploy pede (novo deploy, reinício).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, async () => {
    app.log.info(`${sig} recebido, encerrando`);
    await app.close().catch(() => {});
    await db.end().catch(() => {});
    process.exit(0);
  });
}

if (!config.isProduction) {
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
}
