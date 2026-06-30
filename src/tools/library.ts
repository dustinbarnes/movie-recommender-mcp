import { z } from 'zod';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb, type MovieRow } from '../database/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../');
const LIBRARY_PATH = join(REPO_ROOT, 'library.json');

interface LibraryEntry {
  tmdb_id: number;
  title: string;
  year: number | null;
  status: string;
  use_for_recs: boolean;
  notes: string | null;
  added_at: string;
}

export const exportLibrarySchema = z.object({});
export const importLibrarySchema = z.object({});

export function handleExportLibrary() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM movies ORDER BY title ASC').all() as MovieRow[];

  const entries: LibraryEntry[] = rows.map((r) => ({
    tmdb_id: r.tmdb_id,
    title: r.title,
    year: r.year,
    status: r.status,
    use_for_recs: r.use_for_recs === 1,
    notes: r.notes,
    added_at: r.added_at,
  }));

  writeFileSync(LIBRARY_PATH, JSON.stringify(entries, null, 2) + '\n');

  execSync('git add library.json', { cwd: REPO_ROOT });

  const staged = execSync('git diff --cached --name-only', { cwd: REPO_ROOT }).toString().trim();
  if (!staged) {
    return { success: true, count: entries.length, pushed: false, message: 'Library unchanged, nothing to push.' };
  }

  execSync('git commit -m "Update library"', { cwd: REPO_ROOT });
  execSync('git push', { cwd: REPO_ROOT });

  return { success: true, count: entries.length, pushed: true };
}

export function handleImportLibrary() {
  execSync('git pull', { cwd: REPO_ROOT });

  if (!existsSync(LIBRARY_PATH)) {
    return { success: true, imported: 0, message: 'No library.json found in repo.' };
  }

  const entries: LibraryEntry[] = JSON.parse(readFileSync(LIBRARY_PATH, 'utf-8'));
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO movies (tmdb_id, title, year, status, use_for_recs, notes, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = excluded.title,
      year = excluded.year,
      status = excluded.status,
      use_for_recs = excluded.use_for_recs,
      notes = excluded.notes,
      added_at = excluded.added_at
  `);

  db.transaction((items: LibraryEntry[]) => {
    for (const entry of items) {
      upsert.run(entry.tmdb_id, entry.title, entry.year, entry.status, entry.use_for_recs ? 1 : 0, entry.notes, entry.added_at);
    }
  })(entries);

  return { success: true, imported: entries.length };
}
