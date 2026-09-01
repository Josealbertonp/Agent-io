import { useSyncExternalStore } from 'react';
import { SseTransportStatus } from '../bridge/client';

/**
 * Estado de transporte SSE — NÃO é fonte canônica.
 * O ProjectedState.connectionStatus continua sendo o status do workspace Maestri.
 */
export interface FeedTransportState {
  status: SseTransportStatus;
  detail: string | null;
}

const INITIAL: FeedTransportState = { status: 'disconnected', detail: null };

let state: FeedTransportState = INITIAL;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setFeedTransport(status: SseTransportStatus, detail?: string): void {
  const nextDetail = detail ?? null;
  if (state.status === status && state.detail === nextDetail) return;
  state = { status, detail: nextDetail };
  emit();
}

export function getFeedTransport(): FeedTransportState {
  return state;
}

export function resetFeedTransport(): void {
  if (state.status === INITIAL.status && state.detail === INITIAL.detail) return;
  state = INITIAL;
  emit();
}

export function subscribeFeedTransport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFeedTransport(): FeedTransportState {
  return useSyncExternalStore(subscribeFeedTransport, getFeedTransport, getFeedTransport);
}
