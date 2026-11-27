-- Missões diárias/semanais: o sorteio é calculado (determinístico); aqui só fica o resgate do prêmio.
CREATE TABLE mission_claims (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id   text NOT NULL,
  period_start date NOT NULL,
  xp           integer NOT NULL,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id, period_start)
);

-- Desafios entre amigos.
CREATE TABLE challenges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric           text NOT NULL CHECK (metric IN ('distance', 'area', 'conquests')),
  days             integer NOT NULL CHECK (days BETWEEN 1 AND 30),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'declined', 'cancelled', 'finished')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  starts_at        timestamptz,
  ends_at          timestamptz,
  challenger_score double precision,
  opponent_score   double precision,
  winner_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (challenger_id <> opponent_id)
);
CREATE INDEX challenges_challenger ON challenges (challenger_id, created_at DESC);
CREATE INDEX challenges_opponent ON challenges (opponent_id, created_at DESC);
-- No máximo um desafio aberto (pendente ou em andamento) por dupla.
CREATE UNIQUE INDEX challenges_one_open_per_pair
  ON challenges (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  WHERE status IN ('pending', 'active');

-- Bairros e regiões da cidade (importados de GeoJSON; ver docs/BAIRROS.md).
CREATE TABLE regions (
  id       serial PRIMARY KEY,
  name     text NOT NULL,
  city     text NOT NULL DEFAULT '',
  kind     text NOT NULL DEFAULT 'bairro',
  geom     geometry(MultiPolygon, 4326) NOT NULL,
  area_m2  double precision NOT NULL,
  UNIQUE (name, city)
);
CREATE INDEX regions_geom_gix ON regions USING gist (geom);
CREATE INDEX conquest_events_geom_gix ON conquest_events USING gist (geom);
