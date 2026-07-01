import { z } from 'zod';
import { spawnSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDb, type MovieRow } from '../database/db.js';

export const fetchMovieSummarySchema = z.object({
  tmdb_id: z.number().describe('TMDB movie ID'),
});

export const googleSearchSchema = z.object({
  query: z.string().describe('Search query to send to Google AI Mode'),
});

function cleanSummary(raw: string): string {
  // Strip Google UI noise after the actual AI content
  const cutoff = raw.indexOf('\nCopy\n\n# Share public link');
  let text = cutoff !== -1 ? raw.slice(0, cutoff) : raw;

  // Strip backtick-wrapped citation refs e.g. `[1][2][3]`
  text = text.replace(/`(\[\d+\])+`/g, '');
  // Strip plain inline citation refs e.g. [1][2]
  text = text.replace(/(\[\d+\])+/g, '');
  // Strip emojis
  text = text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, '');
  // Clean up trailing whitespace and excess blank lines left behind
  text = text.replace(/[^\S\n]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

function runGoogleSearch(query: string): string {
  const outPath = join(tmpdir(), `google-search-${Date.now()}.md`);
  const skillDir = join(process.env['HOME'] ?? '~', '.claude/skills/google-ai-mode');

  const result = spawnSync('python3', ['scripts/run.py', 'search.py', '--query', query, '--output', outPath], {
    cwd: skillDir,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`Google AI search failed: ${result.stderr || result.stdout}`);
  }

  if (!existsSync(outPath)) {
    throw new Error('Search completed but no output file was written');
  }

  const raw = readFileSync(outPath, 'utf-8');
  unlinkSync(outPath);

  return cleanSummary(raw);
}

export function handleGoogleSearch(args: z.infer<typeof googleSearchSchema>) {
  const result = runGoogleSearch(args.query);
  return { result };
}

export function handleFetchMovieSummary(args: z.infer<typeof fetchMovieSummarySchema>) {
  const db = getDb();
  const movie = db.prepare('SELECT * FROM movies WHERE tmdb_id = ?').get(args.tmdb_id) as MovieRow | undefined;
  if (!movie) throw new Error(`Movie ${args.tmdb_id} not found in library`);

  const query = `${movie.title}${movie.year ? ` ${movie.year}` : ''} film synopsis themes`;
  const summary = runGoogleSearch(query);

  db.prepare('UPDATE movies SET notes = ? WHERE tmdb_id = ?').run(summary, args.tmdb_id);

  return { success: true, tmdb_id: args.tmdb_id, title: movie.title, summary };
}
