-- Dfuse App Shell & Navigation — Supabase Migration
-- Run this in your Supabase project's SQL editor.
-- Existing tables (user_logins, user_sessions) are untouched.

-- ─── Canvases ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canvases (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT 'Untitled Canvas',
  canvas_state  JSONB       DEFAULT '{}'::jsonb,
  node_count    INTEGER     DEFAULT 0,
  thumbnail_svg TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvases_user_id ON canvases(user_id);

-- ─── Schemas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schemas (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            TEXT        NOT NULL,
  name               TEXT        NOT NULL DEFAULT 'Untitled Schema',
  file_count         INTEGER     DEFAULT 0,
  record_count       INTEGER     DEFAULT 0,
  relationships      JSONB       DEFAULT '[]'::jsonb,
  merged_dataset_id  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schemas_user_id ON schemas(user_id);
