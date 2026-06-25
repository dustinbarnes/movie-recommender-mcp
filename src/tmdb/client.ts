import { getDb, type CacheRow } from '../database/db.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_DAYS = 30;

export interface TmdbMovieDetails {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  genres: Array<{ id: number; name: string }>;
  keywords?: { keywords: Array<{ id: number; name: string }> };
  vote_average: number;
  vote_count: number;
  runtime: number | null;
  credits?: {
    crew: Array<{ job: string; name: string }>;
    cast: Array<{ name: string; order: number }>;
  };
}

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
}

export interface TmdbDiscoverResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

function apiKey(): string {
  const key = process.env['TMDB_API_KEY'];
  if (!key) throw new Error('TMDB_API_KEY is not set');
  return key;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_key', apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function searchMovies(query: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch<{ results: TmdbSearchResult[] }>('/search/movie', { query, include_adult: 'false' });
  return data.results.slice(0, 5);
}

export async function fetchAndCacheMovie(tmdbId: number): Promise<TmdbMovieDetails> {
  const db = getDb();
  const cached = db.prepare('SELECT * FROM tmdb_cache WHERE tmdb_id = ?').get(tmdbId) as CacheRow | undefined;

  if (cached) {
    const age = (Date.now() - new Date(cached.cached_at).getTime()) / (1000 * 60 * 60 * 24);
    if (age < CACHE_TTL_DAYS) return JSON.parse(cached.data) as TmdbMovieDetails;
  }

  const details = await tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    append_to_response: 'keywords,credits',
  });

  db.prepare(`
    INSERT INTO tmdb_cache (tmdb_id, data, cached_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT (tmdb_id) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at
  `).run(tmdbId, JSON.stringify(details));

  return details;
}

export async function discoverMovies(params: {
  withKeywords?: number[];
  withGenres?: number[];
  withoutKeywords?: number[];
  limit?: number;
}): Promise<TmdbDiscoverResult[]> {
  const query: Record<string, string> = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '100',
    include_adult: 'false',
  };
  if (params.withKeywords?.length) query['with_keywords'] = params.withKeywords.join('|');
  if (params.withGenres?.length) query['with_genres'] = params.withGenres.join('|');
  if (params.withoutKeywords?.length) query['without_keywords'] = params.withoutKeywords.join(',');

  const data = await tmdbFetch<{ results: TmdbDiscoverResult[] }>('/discover/movie', query);
  return data.results.slice(0, params.limit ?? 10);
}

export async function searchKeyword(keyword: string): Promise<Array<{ id: number; name: string }>> {
  const data = await tmdbFetch<{ results: Array<{ id: number; name: string }> }>('/search/keyword', { query: keyword });
  return data.results.slice(0, 3);
}
