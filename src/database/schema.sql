CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'down', 'up', 'double_up')),
  use_for_recs INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tmdb_cache (
  tmdb_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
