import { Event } from '../contracts';
import { WorkspaceSource, WorkspaceSnapshot, AdapterCheckpoint } from './types';
import { diffSnapshots } from './differ';
import {
  createInitialCheckpoint,
  capEmittedEventIds,
  mergeEmittedEventId,
  EMITTED_EVENT_IDS_CAP,
} from './checkpoint';

export interface MaestriPollerOptions {
  intervalMs?: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  backoffFactor?: number;
  /** Fração de jitter (±). 0 = determinístico (útil em testes). Default 0.1. */
  jitterRatio?: number;
  checkpoint?: AdapterCheckpoint;
  onEvents?: (events: Event[]) => void;
  onSnapshot?: (snapshot: WorkspaceSnapshot) => void;
  onError?: (error: unknown) => void;
}

/**
 * Orquestrador de polling com backoff, resume via lastSnapshot e dedupe por emittedEventIds.
 */
export class MaestriPoller {
  private readonly source: WorkspaceSource;
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly backoffFactor: number;
  private readonly jitterRatio: number;
  private currentIntervalMs: number;
  private consecutiveFailures: number = 0;

  private isRunning: boolean = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: WorkspaceSnapshot | null = null;
  private checkpoint: AdapterCheckpoint;
  private emittedEventIds: Set<string>;
  private emittedEventIdsOrder: string[];

  private readonly onEvents?: (events: Event[]) => void;
  private readonly onSnapshot?: (snapshot: WorkspaceSnapshot) => void;
  private readonly onError?: (error: unknown) => void;

  constructor(source: WorkspaceSource, options: MaestriPollerOptions = {}) {
    this.source = source;
    this.minIntervalMs = options.minIntervalMs ?? options.intervalMs ?? 3000;
    this.maxIntervalMs = options.maxIntervalMs ?? 30000;
    this.backoffFactor = options.backoffFactor ?? 1.5;
    this.jitterRatio = options.jitterRatio ?? 0.1;
    this.currentIntervalMs = this.minIntervalMs;
    this.checkpoint = options.checkpoint
      ? { ...options.checkpoint, emittedEventIds: capEmittedEventIds(options.checkpoint.emittedEventIds) }
      : createInitialCheckpoint();

    this.lastSnapshot = this.checkpoint.lastSnapshot
      ? structuredClone(this.checkpoint.lastSnapshot)
      : null;
    this.emittedEventIdsOrder = [...this.checkpoint.emittedEventIds];
    this.emittedEventIds = new Set(this.emittedEventIdsOrder);

    this.onEvents = options.onEvents;
    this.onSnapshot = options.onSnapshot;
    this.onError = options.onError;
  }

  public getCheckpoint(): AdapterCheckpoint {
    return {
      ...this.checkpoint,
      lastSnapshot: this.lastSnapshot ?? undefined,
      lastSnapshotHash: this.lastSnapshot?.rawHash,
      emittedEventIds: [...this.emittedEventIdsOrder],
    };
  }

  public getCurrentIntervalMs(): number {
    return this.currentIntervalMs;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNext(0);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executa um ciclo individual de poll.
   */
  public async pollOnce(): Promise<Event[]> {
    try {
      const snapshot = await this.source.getWorkspaceSnapshot();

      if (snapshot.connectionStatus === 'error') {
        this.handleFailure(new Error('Workspace snapshot returned error status'));
      } else {
        this.handleSuccess();
      }

      this.onSnapshot?.(snapshot);

      if (this.lastSnapshot && this.lastSnapshot.rawHash === snapshot.rawHash) {
        this.rememberSnapshot(snapshot);
        return [];
      }

      const { events, nextSequence } = diffSnapshots(
        this.lastSnapshot,
        snapshot,
        (this.checkpoint.lastSequence || 0) + 1
      );

      const novel = events.filter((evt) => !this.emittedEventIds.has(evt.eventId));

      this.rememberSnapshot(snapshot);

      if (novel.length > 0) {
        this.checkpoint.lastSequence = nextSequence - 1;
        this.checkpoint.lastOccurredAt = snapshot.timestamp;
        this.checkpoint.updatedAt = new Date().toISOString();

        for (const evt of novel) {
          this.rememberEmitted(evt.eventId);
        }

        this.onEvents?.(novel);
      }

      return novel;
    } catch (err) {
      this.handleFailure(err);
      this.onError?.(err);
      return [];
    }
  }

  private rememberSnapshot(snapshot: WorkspaceSnapshot): void {
    this.lastSnapshot = snapshot;
    this.checkpoint.lastSnapshot = snapshot;
    this.checkpoint.lastSnapshotHash = snapshot.rawHash;
    this.checkpoint.updatedAt = new Date().toISOString();
  }

  private rememberEmitted(eventId: string): void {
    if (this.emittedEventIds.has(eventId)) return;
    this.emittedEventIdsOrder = mergeEmittedEventId(
      this.emittedEventIdsOrder,
      eventId,
      EMITTED_EVENT_IDS_CAP
    );
    this.emittedEventIds = new Set(this.emittedEventIdsOrder);
    this.checkpoint.emittedEventIds = [...this.emittedEventIdsOrder];
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      await this.pollOnce();
      if (this.isRunning) {
        this.scheduleNext(this.currentIntervalMs);
      }
    }, delayMs);
  }

  private handleSuccess(): void {
    this.consecutiveFailures = 0;
    this.currentIntervalMs = this.minIntervalMs;
  }

  private handleFailure(_error: unknown): void {
    this.consecutiveFailures++;
    const rawInterval = this.minIntervalMs * Math.pow(this.backoffFactor, this.consecutiveFailures);
    const jitter = this.jitterRatio === 0 ? 0 : (Math.random() * 2 - 1) * this.jitterRatio * rawInterval;
    this.currentIntervalMs = Math.min(
      this.maxIntervalMs,
      Math.max(this.minIntervalMs, rawInterval + jitter)
    );
  }
}
