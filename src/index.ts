import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { searchMoviesSchema, handleSearchMovies } from './tools/search.js';
import {
  addMovieSchema, handleAddMovie,
  updateMovieSchema, handleUpdateMovie,
  removeMovieSchema, handleRemoveMovie,
  listMoviesSchema, handleListMovies,
  getMovieSchema, handleGetMovie,
} from './tools/movies.js';
import { getRecommendationsSchema, handleGetRecommendations } from './tools/recommendations.js';

if (!process.env['TMDB_API_KEY']) {
  console.error('Error: TMDB_API_KEY environment variable is required');
  process.exit(1);
}

const server = new McpServer({
  name: 'movie-recommender',
  version: '1.0.0',
});

server.tool('search_movies', 'Search TMDB for a movie by title to find its ID before adding', searchMoviesSchema.shape, async (args) => {
  const results = await handleSearchMovies(args);
  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
});

server.tool('add_movie', 'Add a movie to your library with a rating and optional notes', addMovieSchema.shape, async (args) => {
  const result = await handleAddMovie(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('update_movie', 'Update the status, use_for_recs flag, or notes for a movie in your library', updateMovieSchema.shape, async (args) => {
  const result = await handleUpdateMovie(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('remove_movie', 'Remove a movie from your library', removeMovieSchema.shape, async (args) => {
  const result = handleRemoveMovie(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('list_movies', 'List movies in your library, optionally filtered by status', listMoviesSchema.shape, async (args) => {
  const result = handleListMovies(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_movie', 'Get full details for a movie in your library including cached TMDB data', getMovieSchema.shape, async (args) => {
  const result = await handleGetMovie(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_recommendations', 'Get movie recommendations based on your library. Optionally provide a theme to bias results.', getRecommendationsSchema.shape, async (args) => {
  const result = await handleGetRecommendations(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
