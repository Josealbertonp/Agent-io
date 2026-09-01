import { Event, EventSchema } from '../contracts';

/** Porta default da BridgeServer (`npm run bridge`). Uma única fonte de verdade. */
export const DEFAULT_SSE_PORT = 3001;
export const DEFAULT_SSE_URL = `http://localhost:${DEFAULT_SSE_PORT}/events`;

export type SseTransportStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface SseClientOptions {
  /** Default: `http://localhost:3001/events` (mesma porta da bridge). */
  url?: string;
  onEvent: (event: Event) => void;
  onError?: (error: unknown) => void;
  onStatus?: (status: SseTransportStatus, detail?: string) => void;
  /** Intervalo mínimo de reconnect (ms). Default 1000. */
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
  reconnectBackoffFactor?: number;
  jitterRatio?: number;
  fetchImpl?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

export function computeReconnectBackoffMs(
  consecutiveFailures: number,
  minMs: number,
  maxMs: number,
  factor: number,
  jitterRatio: number = 0
): number {
  const safeFailures = Math.max(1, consecutiveFailures);
  const raw = minMs * Math.pow(factor, safeFailures);
  const jitter = jitterRatio === 0 ? 0 : (Math.random() * 2 - 1) * jitterRatio * raw;
  return Math.min(maxMs, Math.max(minMs, raw + jitter));
}

/**
 * Utilitário puro de parse para fluxos text/event-stream do SSE.
 */
export function parseSseChunk(chunk: string): { eventId?: string; type?: string; data?: unknown } | null {
  const lines = chunk.split(/\r?\n/);
  let eventId: string | undefined;
  let type: string | undefined;
  let dataStr: string = '';

  for (const line of lines) {
    if (line.startsWith('id:')) {
      eventId = line.slice(3).trim();
    } else if (line.startsWith('event:')) {
      type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataStr += line.slice(5).trim();
    }
  }

  if (!dataStr) return null;

  try {
    const data = JSON.parse(dataStr);
    return { eventId, type, data };
  } catch {
    return null;
  }
}

/**
 * Cliente SSE com reconnect real (loop + backoff) e Last-Event-ID.
 * Browser e Node: usa fetch/stream (injetável para testes).
 */
export class SseEventClient {
  public readonly url: string;
  private readonly onEvent: (event: Event) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly onStatus?: (status: SseTransportStatus, detail?: string) => void;
  private transportStatus: SseTransportStatus = 'disconnected';
  private readonly minReconnectIntervalMs: number;
  private readonly maxReconnectIntervalMs: number;
  private readonly reconnectBackoffFactor: number;
  private readonly jitterRatio: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepFn?: (ms: number) => Promise<void>;

  private isClosed: boolean = true;
  private loopRunning: boolean = false;
  private lastEventId?: string;
  private consecutiveFailures: number = 0;
  private currentReconnectIntervalMs: number;
  private abortController: AbortController | null = null;

  constructor(options: SseClientOptions) {
    this.url = options.url ?? DEFAULT_SSE_URL;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.onStatus = options.onStatus;
    this.minReconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs ?? 15000;
    this.reconnectBackoffFactor = options.reconnectBackoffFactor ?? 2;
    this.jitterRatio = options.jitterRatio ?? 0.1;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleepFn = options.sleepFn;
    this.currentReconnectIntervalMs = this.minReconnectIntervalMs;
  }

  public get isOpen(): boolean {
    return !this.isClosed;
  }

  public getLastEventId(): string | undefined {
    return this.lastEventId;
  }

  public getCurrentReconnectIntervalMs(): number {
    return this.currentReconnectIntervalMs;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public getTransportStatus(): SseTransportStatus {
    return this.transportStatus;
  }

  public connect(): void {
    if (this.loopRunning) return;
    this.isClosed = false;
    this.loopRunning = true;
    this.setTransportStatus('connecting');
    void this.runLoop();
  }

  public close(): void {
    this.isClosed = true;
    this.abortController?.abort();
    this.abortController = null;
    this.setTransportStatus('disconnected');
  }

  public handleMessage(rawChunk: string): void {
    const parsed = parseSseChunk(rawChunk);
    if (!parsed || !parsed.data) return;

    try {
      const validated = EventSchema.parse(parsed.data);
      this.lastEventId = validated.eventId;
      this.onEvent(validated);
    } catch (err) {
      this.onError?.(err);
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.isClosed) {
      try {
        await this.readStream();
        this.consecutiveFailures = 0;
        this.currentReconnectIntervalMs = this.minReconnectIntervalMs;
        if (this.isClosed) break;
        this.setTransportStatus('reconnecting', 'stream encerrado');
        await this.sleep(this.minReconnectIntervalMs);
      } catch (err) {
        if (this.isClosed) break;
        this.onError?.(err);
        this.consecutiveFailures++;
        this.setTransportStatus(
          this.consecutiveFailures === 1 ? 'error' : 'reconnecting',
          err instanceof Error ? err.message : String(err)
        );
        this.currentReconnectIntervalMs = computeReconnectBackoffMs(
          this.consecutiveFailures,
          this.minReconnectIntervalMs,
          this.maxReconnectIntervalMs,
          this.reconnectBackoffFactor,
          this.jitterRatio
        );
        await this.sleep(this.currentReconnectIntervalMs);
      }
    }
    this.loopRunning = false;
  }

  private async readStream(): Promise<void> {
    this.abortController = new AbortController();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    const res = await this.fetchImpl(this.url, {
      headers,
      signal: this.abortController.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: ${res.status}`);
    }

    this.setTransportStatus('connected');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!this.isClosed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          this.handleMessage(`${part}\n\n`);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // stream já encerrado
      }
    }
  }

  private setTransportStatus(status: SseTransportStatus, detail?: string): void {
    this.transportStatus = status;
    this.onStatus?.(status, detail);
  }

  private async sleep(ms: number): Promise<void> {
    if (this.sleepFn) {
      await this.sleepFn(ms);
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
