import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env['DB_PATH'] ?? './movies.db';
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    _db.exec(schema);
  }
  return _db;
}

export interface MovieRow {
  id: number;
  tmdb_id: number;
  title: string;
  year: number | null;
  status: 'watchlist' | 'down' | 'up' | 'double_up';
  use_for_recs: number;
  notes: string | null;
  added_at: string;
}

export interface CacheRow {
  tmdb_id: number;
  data: string;
  cached_at: string;
}
