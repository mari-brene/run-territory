-- Sessões expiram por inatividade (ver SESSION_TTL_DAYS).
ALTER TABLE sessions ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_user ON sessions (user_id);
