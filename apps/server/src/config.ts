export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/runterritory',
  /** Corredores aparecem "ao vivo" no mapa se mandaram ponto nos últimos N segundos. */
  liveWindowS: Number(process.env.LIVE_WINDOW_S ?? 120),
};
