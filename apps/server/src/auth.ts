import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';
import type { Db } from './db';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

// Hash fixo para gastar o mesmo tempo quando o usuário não existe (não revela quais contas existem).
const DUMMY_HASH = hashPassword('senha-que-ninguem-usa');
export async function verifyPasswordOrDummy(pw: string, stored: string | undefined) {
  if (!stored) {
    await verifyPassword(pw, await DUMMY_HASH);
    return false;
  }
  return verifyPassword(pw, stored);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [sha(token), userId]);
  return token;
}

export async function userIdFromToken(db: Db, token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  // Valida e renova a sessão numa consulta só; a renovação só grava se passou mais de 1 hora.
  const { rows } = await db.query(
    `UPDATE sessions SET last_used_at = CASE WHEN last_used_at < now() - interval '1 hour' THEN now() ELSE last_used_at END
     WHERE token_hash = $1 AND last_used_at > now() - make_interval(days => $2)
     RETURNING user_id`,
    [sha(token), config.sessionTtlDays],
  );
  return rows[0]?.user_id ?? null;
}

export async function purgeExpiredSessions(db: Db) {
  await db.query(`DELETE FROM sessions WHERE last_used_at < now() - make_interval(days => $1)`, [config.sessionTtlDays]);
}

export async function endSession(db: Db, token: string) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export function requireAuth(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await userIdFromToken(db, bearer(req));
    if (!uid) return reply.code(401).send({ error: 'não autenticado' });
    req.userId = uid;
  };
}

export const PALETTE = ['#FF3B5C', '#00C2FF', '#FFB800', '#7CFF4F', '#B04BFF', '#FF7A00', '#00E0A4', '#FF4FD8', '#3D7BFF', '#E8FF3A'];
export const randomColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
