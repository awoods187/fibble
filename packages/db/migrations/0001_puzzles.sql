-- 0001: published puzzle days (ADR 0012).
-- Run once as the project owner in Neon's SQL Editor; safe to run again.
-- The roles themselves are created with passwords from 1Password; see docs/hosting.md.

CREATE TABLE IF NOT EXISTS puzzles (
  date         date        PRIMARY KEY,
  puzzle       jsonb       NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO fibble_reader, fibble_publisher;
-- The app reads only.
GRANT SELECT                 ON puzzles TO fibble_reader;
-- The nightly publish job adds and updates days, and can never delete one.
GRANT SELECT, INSERT, UPDATE ON puzzles TO fibble_publisher;
