-- schema.sql
-- Run this against your D1 database to create the submissions table.
-- Command:
--   npx wrangler d1 execute DB --remote --file=schema.sql
-- (DB is the binding name in your Pages project; --remote targets the live DB)

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT,
  options TEXT,
  event_dates TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);