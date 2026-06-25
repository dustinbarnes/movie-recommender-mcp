import { z } from 'zod';
import { searchMovies } from '../tmdb/client.js';
import { getDb } from '../database/db.js';

export const searchMoviesSchema = z.object({
  query: z.string().describe('Movie title or keywords to search for'),
});

export async function handleSearchMovies(args: z.infer<typeof searchMoviesSchema>) {
  const results = await searchMovies(args.query);
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
