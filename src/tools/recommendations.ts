import { z } from 'zod';
import { getDb, type MovieRow, type CacheRow } from '../database/db.js';
import { discoverMovies, fetchAndCacheMovie, searchKeyword, type TmdbMovieDetails } from '../tmdb/client.js';

export const getRecommendationsSchema = z.object({
  theme: z.string().optional().describe('Optional freeform theme e.g. "time loops", "lovecraftian horror"'),
  limit: z.number().default(10).describe('Number of TMDB discover results to return'),
});

const RATING_WEIGHT: Record<string, number> = { double_up: 3, up: 1 };

interface ScoredKeyword { id: number; name: string; score: number }
interface ScoredGenre { id: number; name: string; score: number }

export async function handleGetRecommendations(args: z.infer<typeof getRecommendationsSchema>) {
  const db = getDb();
  const allMovies = db.prepare('SELECT * FROM movies').all() as MovieRow[];

  const likedForRecs = allMovies.filter(
    (m) => (m.status === 'up' || m.status === 'double_up') && m.use_for_recs === 1
  );
  const disliked = allMovies.filter((m) => m.status === 'down');
  const watchlist = allMovies.filter((m) => m.status === 'watchlist');
  const likedNoRec = allMovies.filter(
    (m) => (m.status === 'up' || m.status === 'double_up') && m.use_for_recs === 0
  );

  if (likedForRecs.length === 0 && !args.theme) {
    return {
      message: 'Add some liked movies first, or provide a theme to get recommendations.',
      discover: [],
      from_your_library: [],
    };
  }

  // Build weighted keyword and genre maps from liked movies
  const keywordScores = new Map<number, ScoredKeyword>();
  const genreScores = new Map<number, ScoredGenre>();

  for (const movie of likedForRecs) {
    const weight = RATING_WEIGHT[movie.status] ?? 1;
    const cached = db.prepare('SELECT data FROM tmdb_cache WHERE tmdb_id = ?').get(movie.tmdb_id) as
      | Pick<CacheRow, 'data'>
      | undefined;
    if (!cached) continue;
    const details = JSON.parse(cached.data) as TmdbMovieDetails;

    for (const kw of details.keywords?.keywords ?? []) {
      const existing = keywordScores.get(kw.id);
      keywordScores.set(kw.id, { id: kw.id, name: kw.name, score: (existing?.score ?? 0) + weight });
    }
    for (const g of details.genres) {
      const existing = genreScores.get(g.id);
      genreScores.set(g.id, { id: g.id, name: g.name, score: (existing?.score ?? 0) + weight });
    }
  }

  // Top keywords and genres by score
  const topKeywords = [...keywordScores.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const topGenres = [...genreScores.values()].sort((a, b) => b.score - a.score).slice(0, 3);

  let themeKeywordIds: number[] = [];

  // If theme provided, resolve it to TMDB keyword IDs
  if (args.theme) {
    const words = args.theme.split(/\s+/).slice(0, 3);
    const results = await Promise.all(words.map((w) => searchKeyword(w)));
    themeKeywordIds = results.flat().map((k) => k.id);
  }

  const withKeywords = themeKeywordIds.length > 0
    ? themeKeywordIds
    : topKeywords.map((k) => k.id);

  const withGenres = themeKeywordIds.length > 0 ? [] : topGenres.map((g) => g.id);

  // IDs already in library — exclude from discover results
  const libraryIds = new Set(allMovies.map((m) => m.tmdb_id));

  const discovered = await discoverMovies({ withKeywords, withGenres, limit: args.limit + 10 });
  const filtered = discovered.filter((m) => !libraryIds.has(m.id)).slice(0, args.limit);

  // Fetch details for discover results to enrich recommendations
  const discoverResults = await Promise.all(
    filtered.map(async (m) => {
      const details = await fetchAndCacheMovie(m.id);
      return {
        tmdb_id: m.id,
        title: m.title,
        year: m.release_date ? parseInt(m.release_date.slice(0, 4)) : null,
        overview: m.overview,
        vote_average: m.vote_average,
        genres: details.genres.map((g) => g.name),
        keywords: details.keywords?.keywords.map((k) => k.name).slice(0, 8) ?? [],
        director: details.credits?.crew.find((c) => c.job === 'Director')?.name ?? null,
      };
    })
  );

  // Surface watchlist + liked_no_rec items as library recommendations
  // Score them by keyword overlap with top keywords
  const libraryRecs = await Promise.all(
    [...watchlist, ...likedNoRec].map(async (m) => {
      const cached = db.prepare('SELECT data FROM tmdb_cache WHERE tmdb_id = ?').get(m.tmdb_id) as
        | Pick<CacheRow, 'data'>
        | undefined;
      if (!cached) return null;
      const details = JSON.parse(cached.data) as TmdbMovieDetails;
      const movieKeywordIds = new Set(details.keywords?.keywords.map((k) => k.id) ?? []);
      const overlap = topKeywords.filter((k) => movieKeywordIds.has(k.id)).reduce((s, k) => s + k.score, 0);
      return { movie: m, details, overlap };
    })
  );

  const topLibraryRecs = libraryRecs
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)
    .map(({ movie, details }) => ({
      tmdb_id: movie.tmdb_id,
      title: movie.title,
      year: movie.year,
      status: movie.status,
      notes: movie.notes,
      genres: details.genres.map((g) => g.name),
      overview: details.overview,
    }));

  return {
    taste_profile: {
      top_keywords: topKeywords.slice(0, 5).map((k) => k.name),
      top_genres: topGenres.map((g) => g.name),
      based_on: likedForRecs.length,
    },
    disliked_context: disliked.map((m) => ({ title: m.title, notes: m.notes })),
    discover: discoverResults,
    from_your_library: topLibraryRecs,
  };
}
