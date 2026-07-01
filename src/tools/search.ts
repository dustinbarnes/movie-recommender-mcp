import { z } from 'zod';
import { searchMovies, fetchAndCacheMovie } from '../tmdb/client.js';
import { getDb } from '../database/db.js';

export const searchMoviesSchema = z.object({
  query: z.string().describe('Movie title or keywords to search for'),
  year: z.number().optional().describe('Release year to narrow results'),
});

export const tmdbLookupSchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID to look up'),
});

export async function handleTmdbLookup(args: z.infer<typeof tmdbLookupSchema>) {
  const details = await fetchAndCacheMovie(args.tmdb_id);
  const db = getDb();
  const inLibrary = db.prepare('SELECT status FROM movies WHERE tmdb_id = ?').get(args.tmdb_id) as
    | { status: string }
    | undefined;
  return {
    tmdb_id: details.id,
    title: details.title,
    year: details.release_date ? parseInt(details.release_date.slice(0, 4)) : null,
    overview: details.overview,
    in_library: inLibrary?.status ?? null,
  };
}

export async function handleSearchMovies(args: z.infer<typeof searchMoviesSchema>) {
  const results = await searchMovies(args.query, args.year);
  const db = getDb();

  return results.map((r) => {
    const year = r.release_date ? parseInt(r.release_date.slice(0, 4)) : null;
    const inLibrary = db.prepare('SELECT status FROM movies WHERE tmdb_id = ?').get(r.id) as
      | { status: string }
      | undefined;
    return {
      tmdb_id: r.id,
      title: r.title,
      year,
      overview: r.overview ? r.overview.slice(0, 150) + (r.overview.length > 150 ? '...' : '') : null,
      in_library: inLibrary ? inLibrary.status : null,
    };
  });
}
