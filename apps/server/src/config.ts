// Configuração lida das variáveis de ambiente. Veja .env.example e docs/PUBLICAR-ONLINE.md.
const env = process.env;
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'sim'].includes(v.toLowerCase()));

const isProduction = env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  databaseUrl: env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/runterritory',
  /** Bancos na nuvem (Supabase, Neon, Railway via proxy público) costumam exigir SSL. */
  databaseSsl: bool(env.DATABASE_SSL, false),
  /** Origens liberadas no CORS, separadas por vírgula. Vazio = qualquer origem (o app usa token, não cookie). */
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Atrás de um proxy (Railway, Render, Fly), para o limite de tentativas usar o IP real. */
  trustProxy: bool(env.TRUST_PROXY, isProduction),
  /** Limita tentativas de login/cadastro e chamadas por minuto. */
  rateLimit: bool(env.RATE_LIMIT, true),
  /** O mapa público (sem login) mostra também onde os corredores estão AGORA? */
  publicLiveRunners: bool(env.PUBLIC_LIVE_RUNNERS, !isProduction),
  /** Sessões (login) expiram depois de N dias sem uso. */
  sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 60),
  /** Fuso usado para "hoje", "esta semana" e "este mês" (missões e rankings). */
  timezone: env.APP_TIMEZONE ?? 'America/Sao_Paulo',
  /** Corredores aparecem "ao vivo" no mapa se mandaram ponto nos últimos N segundos. */
  liveWindowS: Number(env.LIVE_WINDOW_S ?? 120),
};

/** Em produção, recusa subir com configuração perigosa em vez de falhar escondido. */
export function assertProductionConfig() {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL não definida');
  if (!Number.isFinite(config.port)) problems.push('PORT inválida');
  if (problems.length) {
    console.error(`Configuração inválida para produção:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
}
