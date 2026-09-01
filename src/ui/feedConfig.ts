import { DEFAULT_SSE_URL } from '../bridge/client';

export type FeedMode = 'fake' | 'sse';

export interface FeedConfig {
  mode: FeedMode;
  sseUrl: string;
}

/**
 * Default = fake/local (não exige bridge).
 * VITE_AGENT_IO_FEED=sse + VITE_AGENT_IO_SSE_URL para a ponte.
 * Sem env, a URL SSE é `http://localhost:3001/events` (DEFAULT_SSE_URL).
 */
export function getFeedConfig(): FeedConfig {
  const raw = import.meta.env.VITE_AGENT_IO_FEED;
  const mode: FeedMode = raw === 'sse' ? 'sse' : 'fake';
  const sseUrl = import.meta.env.VITE_AGENT_IO_SSE_URL || DEFAULT_SSE_URL;
  return { mode, sseUrl };
}
