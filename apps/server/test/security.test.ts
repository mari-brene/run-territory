import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createPool } from '../src/db';
import { migrate } from '../src/migrate';

const db = createPool(process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/runterritory_test');
const app = buildApp(db, { rateLimit: true });

beforeAll(async () => {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
});

const register = (username: string) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@ex.com`, password: 'segredo123' } });

describe('segurança', () => {
  it('limita tentativas de login por IP', async () => {
    expect((await register('alvo')).statusCode).toBe(201);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'alvo', password: 'errada' } });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('envia cabeçalhos de segurança', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sessão vencida deixa de valer', async () => {
    const r = await register('velho');
    const { token } = r.json();
    const me = () => app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect((await me()).statusCode).toBe(200);
    await db.query(`UPDATE sessions SET last_used_at = now() - interval '400 days'`);
    expect((await me()).statusCode).toBe(401);
  });

  it('exclui a conta com a senha e apaga o território', async () => {
    const r = await register('saindo');
    const { token, user } = r.json();
    const h = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'DELETE', url: '/api/me', headers: h, payload: { password: 'errada' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/me', headers: h, payload: { password: 'segredo123' } })).statusCode).toBe(200);
    expect((await db.query('SELECT 1 FROM users WHERE id = $1', [user.id])).rowCount).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: h })).statusCode).toBe(401);
  });
});
