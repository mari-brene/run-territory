-- Run Territory — esquema inicial (PostgreSQL 16 + PostGIS 3)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  color         text NOT NULL,
  xp            integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Um MultiPolygon por jogador. Invariante mantida pelo backend: territórios não se sobrepõem.
CREATE TABLE territories (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  geom       geometry(MultiPolygon, 4326) NOT NULL,
  area_m2    double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX territories_geom_gix ON territories USING gist (geom);

CREATE TABLE runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('active', 'paused', 'finished')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  distance_m      double precision NOT NULL DEFAULT 0,
  moving_time_s   double precision NOT NULL DEFAULT 0,
  area_gained_m2  double precision NOT NULL DEFAULT 0,
  area_stolen_m2  double precision NOT NULL DEFAULT 0,
  captures        integer NOT NULL DEFAULT 0,
  xp_earned       integer NOT NULL DEFAULT 0,
  state           jsonb NOT NULL,
  last_point      geometry(Point, 4326),
  last_point_at   timestamptz
);
CREATE INDEX runs_user_started ON runs (user_id, started_at DESC);
CREATE UNIQUE INDEX runs_one_open_per_user ON runs (user_id) WHERE status <> 'finished';
CREATE INDEX runs_live ON runs (last_point_at) WHERE status = 'active';

CREATE TABLE run_points (
  run_id   uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq      integer NOT NULL,
  lat      double precision NOT NULL,
  lng      double precision NOT NULL,
  t        timestamptz NOT NULL,
  acc      real,
  accepted boolean NOT NULL,
  PRIMARY KEY (run_id, seq)
);

-- Histórico de conquistas e perdas.
-- kind: base | capture | loop_capture | steal (user_id = quem tomou, victim_id = quem perdeu)
CREATE TABLE conquest_events (
  id         bigserial PRIMARY KEY,
  run_id     uuid REFERENCES runs(id) ON DELETE SET NULL,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  victim_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  area_m2    double precision NOT NULL,
  geom       geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conquest_events_user ON conquest_events (user_id, created_at DESC);
CREATE INDEX conquest_events_victim ON conquest_events (victim_id, created_at DESC);

CREATE TABLE friendships (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

-- Geometria válida, só polígonos, sem fragmentos < min_area m². NULL se vazia.
CREATE FUNCTION rt_clean(g geometry, min_area double precision DEFAULT 1) RETURNS geometry
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_Multi(ST_Union(d.geom))
  FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(g), 3)) d
  WHERE g IS NOT NULL AND NOT ST_IsEmpty(d.geom) AND ST_Area(d.geom::geography) >= min_area
$$;

-- Área fechada (paper.io): território ∪ faixa, com todos os buracos NOVOS preenchidos.
-- Um buraco é "antigo" (e continua buraco) se ≥ 98% dele já era buraco no território anterior.
CREATE FUNCTION rt_fill_new_holes(merged geometry, own geometry) RETURNS geometry
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  old_holes geometry;
  shells    geometry;
  keep      geometry;
BEGIN
  IF merged IS NULL THEN RETURN NULL; END IF;
  SELECT ST_Union(ST_MakePolygon(r.geom)) INTO old_holes
  FROM ST_Dump(own) p, ST_DumpRings(p.geom) r
  WHERE own IS NOT NULL AND r.path[1] > 0;

  SELECT ST_Union(ST_MakePolygon(ST_ExteriorRing(p.geom))) INTO shells FROM ST_Dump(merged) p;

  SELECT ST_Union(h.g) INTO keep FROM (
    SELECT ST_MakePolygon(r.geom) AS g
    FROM ST_Dump(merged) p, ST_DumpRings(p.geom) r
    WHERE r.path[1] > 0
  ) h
  WHERE old_holes IS NOT NULL
    AND ST_Area(ST_Intersection(h.g, old_holes)) / NULLIF(ST_Area(h.g), 0) > 0.98;

  IF keep IS NOT NULL THEN shells := ST_Difference(shells, keep); END IF;
  RETURN rt_clean(shells);
END $$;
