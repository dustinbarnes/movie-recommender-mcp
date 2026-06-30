# movie-recommender-mcp

A personal movie recommendation [MCP server](https://modelcontextprotocol.io/) powered by [TMDB](https://www.themoviedb.org/). Build a library of rated movies, and get personalized recommendations based on your taste profile — derived from the keywords and genres of movies you've liked.

TMDB responses are cached locally in SQLite (30-day TTL) to minimize API calls.

## Prerequisites

- Node.js >= 20
- A free [TMDB API key](https://developer.themoviedb.org/docs/getting-started)

## Setup

```bash
npm install
cp .env.example .env
# Add your TMDB_API_KEY to .env
npm run build
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TMDB_API_KEY` | *(required)* | Your TMDB v3 API key |
| `DB_PATH` | `./movies.db` | Path to the SQLite database file |

## Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "movie-recommender": {
      "command": "node",
      "args": ["/absolute/path/to/movie-recommender-mcp/dist/index.js"],
      "env": {
        "TMDB_API_KEY": "your_key_here"
      }
    }
  }
}
```

## Tools

### `search_movies`
Search TMDB by title to find a movie's ID before adding it to your library.

### `add_movie`
Add a movie to your library with a status rating:

| Status | Meaning |
|---|---|
| `watchlist` | Want to watch |
| `down` | Didn't like it |
| `up` | Liked it |
| `double_up` | Loved it (weighted 3× in recommendations) |

Set `use_for_recs: false` to track a movie without influencing your taste profile.

### `update_movie`
Change the status, `use_for_recs` flag, or notes for an existing library entry.

### `remove_movie`
Remove a movie from your library.

### `list_movies`
List your library, optionally filtered by status.

### `get_movie`
Get full details for a library entry — genres, keywords, cast, director, and TMDB metadata.

### `get_recommendations`
Get movie recommendations based on your library. The engine:
1. Builds a weighted taste profile from your liked movies (keywords + genres, with `double_up` weighted 3×)
2. Uses TMDB Discover to find movies matching your top keywords and genres
3. Filters out movies already in your library
4. Also surfaces relevant watchlist items and liked-but-excluded movies ranked by keyword overlap

Pass an optional `theme` (e.g. `"time loops"`, `"lovecraftian horror"`) to bias results toward a specific concept instead.

### `export_library`
Serializes your `movies` table to `library.json` (sorted by title), then commits and pushes it to GitHub. If nothing changed, the push is skipped.

### `import_library`
Runs `git pull`, reads `library.json`, and upserts all entries into your local database. Safe to run on a fresh machine — existing rows are updated, new rows are inserted.

> **Note:** The TMDB cache is not synced — each machine rebuilds it on demand when you first access a movie.

## Development

```bash
npm run dev       # tsx watch mode
npm run typecheck # type check without building
npm run build     # compile to dist/
```
