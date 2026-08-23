-- schema.sql — full schema for the guthrieent-fablegear-survey D1 database.
--
-- The `responses` / `response_tools` / `response_likert` / `response_topics` /
-- `dashboard_summaries` tables already exist on the live database (they were
-- created ad hoc while functions/api/survey.js and dashboard-data.js were
-- built, never checked in). This file is now the source of truth going
-- forward — everything is CREATE TABLE IF NOT EXISTS, so running it against
-- the already-populated live DB is a safe no-op for those and only actually
-- creates the new `events` table below.
--
-- Command:
--   npx wrangler d1 execute DB --remote --file=schema.sql
-- (DB is the binding name in your Pages project; --remote targets the live DB)

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  email TEXT,
  fg_tried TEXT,
  hw_used TEXT,
  pain_point TEXT,
  blind_spot TEXT,
  suggestions TEXT,
  hw_open TEXT,
  fg_open_different TEXT,
  fg_open_missing TEXT,
  multi_tool_friction TEXT,
  raw_json TEXT NOT NULL,
  sentiment TEXT
);
CREATE INDEX IF NOT EXISTS idx_responses_submitted ON responses(submitted_at DESC);

CREATE TABLE IF NOT EXISTS response_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES responses(id),
  category TEXT NOT NULL,
  tool_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_response_tools_response ON response_tools(response_id);
CREATE INDEX IF NOT EXISTS idx_response_tools_tool ON response_tools(tool_id);

CREATE TABLE IF NOT EXISTS response_likert (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES responses(id),
  question_key TEXT NOT NULL,
  value INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_response_likert_response ON response_likert(response_id);

CREATE TABLE IF NOT EXISTS response_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES responses(id),
  topic TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_response_topics_response ON response_topics(response_id);

CREATE TABLE IF NOT EXISTS dashboard_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  response_count INTEGER NOT NULL,
  summary TEXT NOT NULL
);

-- New: site-wide event counters for the unified dashboard (visits, consult
-- requests, survey starts). Survey *completes* are not duplicated here —
-- that's just COUNT(*) on `responses`, which already exists above.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,             -- 'visit' | 'consult_request' | 'survey_start'
  path TEXT,                      -- page path, for 'visit' events
  meta TEXT,                      -- optional small JSON blob, e.g. consult name/email
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at DESC);
