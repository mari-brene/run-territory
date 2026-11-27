-- Visual do corredor: avatar e estilo de conquista (ver packages/engine/src/look.ts).
ALTER TABLE users ADD COLUMN look jsonb NOT NULL DEFAULT '{}'::jsonb;
