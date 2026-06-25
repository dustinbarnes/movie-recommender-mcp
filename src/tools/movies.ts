import { z } from 'zod';
import { getDb, type MovieRow } from '../database/db.js';
import { fetchAndCacheMovie } from '../tmdb/client.js';

export const addMovieSchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID from search_movies'),
  status: z.enum(['watchlist', 'down', 'up', 'double_up']).describe('Your rating/status for this movie'),
  use_for_recs: z.boolean().default(true).describe('Whether to use this movie as input for recommendations'),
  notes: z.string().optional().describe('Your commentary, favorite parts, or reasons for rating'),
});

export const updateMovieSchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID'),
  status: z.enum(['watchlist', 'down', 'up', 'double_up']).optional(),
  use_for_recs: z.boolean().optional(),
  notes: z.string().optional(),
});

export const removeMovieSchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID'),
});

export const listMoviesSchema = z.object({
  status: z.enum(['watchlist', 'down', 'up', 'double_up']).optional().describe('Filter by status'),
});

export const getMovieSchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID'),
});

export async function handleAddMovie(args: z.infer<typeof addMovieSchema>) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(args.tmdb_id);
  if (existing) throw new Error(`Movie with tmdb_id ${args.tmdb_id} is already in your library`);

  const details = await fetchAndCacheMovie(args.tmdb_id);
  const year = details.release_date ? parseInt(details.release_date.slice(0, 4)) : null;

  db.prepare(`
    INSERT INTO movies (tmdb_id, title, year, status, use_for_recs, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(args.tmdb_id, details.title, year, args.status, args.use_for_recs ? 1 : 0, args.notes ?? null);

  return { success: true, title: details.title, year, status: args.status };
}

export async function handleUpdateMovie(args: z.infer<typeof updateMovieSchema>) {
  const db = getDb();
  const movie = db.prepare('SELECT * FROM movies WHERE tmdb_id = ?').get(args.tmdb_id) as MovieRow | undefined;
  if (!movie) throw new Error(`Movie with tmdb_id ${args.tmdb_id} not found in library`);

  const updates: string[] = [];
  const values: unknown[] = [];

  if (args.status !== undefined) { updates.push('status = ?'); values.push(args.status); }
  if (args.use_for_recs !== undefined) { updates.push('use_for_recs = ?'); values.push(args.use_for_recs ? 1 : 0); }
  if (args.notes !== undefined) { updates.push('notes = ?'); values.push(args.notes); }

  if (updates.length === 0) throw new Error('No fields to update');

  values.push(args.tmdb_id);
  db.prepare(`UPDATE movies SET ${updates.join(', ')} WHERE tmdb_id = ?`).run(...values);

  return { success: true, title: movie.title };
}

export function handleRemoveMovie(args: z.infer<typeof removeMovieSchema>) {
  const db = getDb();
  const movie = db.prepare('SELECT title FROM movies WHERE tmdb_id = ?').get(args.tmdb_id) as
    | { title: string }
    | undefined;
  if (!movie) throw new Error(`Movie with tmdb_id ${args.tmdb_id} not found in library`);
  db.prepare('DELETE FROM movies WHERE tmdb_id = ?').run(args.tmdb_id);
  return { success: true, title: movie.title };
}

export function handleListMovies(args: z.infer<typeof listMoviesSchema>) {
  const db = getDb();
  const query = args.status
    ? 'SELECT * FROM movies WHERE status = ? ORDER BY added_at DESC'
    : 'SELECT * FROM movies ORDER BY status, added_at DESC';
  const rows = (args.status
    ? db.prepare(query).all(args.status)
    : db.prepare(query).all()) as MovieRow[];

  return rows.map((r) => ({
    tmdb_id: r.tmdb_id,
    title: r.title,
    year: r.year,
    status: r.status,
    use_for_recs: r.use_for_recs === 1,
    notes: r.notes,
    added_at: r.added_at,
  }));
}

export async function handleGetMovie(args: z.infer<typeof getMovieSchema>) {
  const db = getDb();
  const movie = db.prepare('SELECT * FROM movies WHERE tmdb_id = ?').get(args.tmdb_id) as MovieRow | undefined;
  if (!movie) throw new Error(`Movie with tmdb_id ${args.tmdb_id} not found in library`);

  const details = await fetchAndCacheMovie(args.tmdb_id);

  return {
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    year: movie.year,
    status: movie.status,
    use_for_recs: movie.use_for_recs === 1,
    notes: movie.notes,
    added_at: movie.added_at,
    overview: details.overview,
    genres: details.genres.map((g) => g.name),
    keywords: details.keywords?.keywords.map((k) => k.name) ?? [],
    runtime: details.runtime,
    vote_average: details.vote_average,
    director: details.credits?.crew.find((c) => c.job === 'Director')?.name ?? null,
    cast: details.credits?.cast.slice(0, 5).map((c) => c.name) ?? [],
  };
}
