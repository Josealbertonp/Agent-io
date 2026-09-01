import { Event } from '../contracts';
import { diffSnapshots, FakeWorkspaceSource, WorkspaceSnapshot } from '../adapter';
import { SseEventClient } from '../bridge/client';
import { useProjectedStore } from '../domain';
import {
  cycleDemoAgentStatus,
  createOfficeDemoSnapshot,
  demoSnapshotWithActivity,
  demoSnapshotWithoutAgent,
} from '../view/demoWorkspace';
import { appendPresentationEvents, resetEventLog } from './eventLog';
import { FeedConfig, getFeedConfig } from './feedConfig';
import { resetFeedTransport, setFeedTransport } from './feedTransport';
import { resetSelectionStore, useSelectionStore } from './selectionStore';

/**
 * Ponto único de ingestão da UI: projeta no domínio E anexa no eventLog de apresentação.
 * O eventLog NÃO é fonte de verdade de entidade — só histórico da timeline/extras.
 */
export function ingestAndRecord(events: Event | readonly Event[]): void {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  appendPresentationEvents(list);
  useProjectedStore.getState().ingest(list);
  useSelectionStore.getState().handleEvents(list);
  useSelectionStore.getState().syncWithAgents(useProjectedStore.getState().agents);
}

export interface StoreFeeder {
  readonly mode: FeedConfig['mode'];
  start(): void;
  stop(): void;
  /** Só no modo fake: avança o status do agente demo via differ + ingest. */
  simulateStatusChange(agentId?: string): void;
  /** Só no modo fake: remove um agente do snapshot e emite disconnected. */
  simulateRemoveAgent(agentId: string): void;
  /** Só no modo fake: troca currentActivity sem necessariamente mudar status. */
  simulateActivityChange(agentId: string, activity: string): void;
}

class FakeStoreFeeder implements StoreFeeder {
  readonly mode = 'fake' as const;
  private source: FakeWorkspaceSource;
  private nextSequence = 1;
  private started = false;

  constructor() {
    this.source = new FakeWorkspaceSource(createOfficeDemoSnapshot());
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.emitFrom(null, this.source.snapshotToReturn);
  }

  stop(): void {
    this.started = false;
  }

  simulateStatusChange(agentId: string = 'agent-dev'): void {
    const prev = this.source.snapshotToReturn;
    const next = cycleDemoAgentStatus(prev, agentId);
    this.source.snapshotToReturn = next;
    this.emitFrom(prev, next);
  }

  simulateRemoveAgent(agentId: string): void {
    const prev = this.source.snapshotToReturn;
    const next = demoSnapshotWithoutAgent(prev, agentId);
    this.source.snapshotToReturn = next;
    this.emitFrom(prev, next);
  }

  simulateActivityChange(agentId: string, activity: string): void {
    const prev = this.source.snapshotToReturn;
    const next = demoSnapshotWithActivity(prev, agentId, activity);
    this.source.snapshotToReturn = next;
    this.emitFrom(prev, next);
  }

  private emitFrom(prev: WorkspaceSnapshot | null, curr: WorkspaceSnapshot): void {
    const { events, nextSequence } = diffSnapshots(prev, curr, this.nextSequence);
    this.nextSequence = nextSequence;
    if (events.length > 0) {
      ingestAndRecord(events);
    }
  }
}

class SseStoreFeeder implements StoreFeeder {
  readonly mode = 'sse' as const;
  private client: SseEventClient | null = null;

  constructor(private readonly url: string) {}

  start(): void {
    if (this.client) return;
    setFeedTransport('connecting');
    this.client = new SseEventClient({
      url: this.url,
      onEvent: (event) => {
        ingestAndRecord(event);
      },
      onStatus: (status, detail) => {
        setFeedTransport(status, detail);
      },
    });
    this.client.connect();
  }

  stop(): void {
    this.client?.close();
    this.client = null;
    setFeedTransport('disconnected');
  }

  simulateStatusChange(): void {
    // Modo SSE é somente leitura da ponte — sem escrita no Maestri.
  }

  simulateRemoveAgent(): void {
    // no-op
  }

  simulateActivityChange(): void {
    // no-op
  }
}

let activeFeeder: StoreFeeder | null = null;

export function startStoreFeeder(config: FeedConfig = getFeedConfig()): StoreFeeder {
  stopStoreFeeder();
  resetEventLog();
  resetSelectionStore();
  resetFeedTransport();
  if (config.mode === 'fake') {
    setFeedTransport('connected', 'modo demo local');
  }
  activeFeeder =
    config.mode === 'sse' ? new SseStoreFeeder(config.sseUrl) : new FakeStoreFeeder();
  activeFeeder.start();
  return activeFeeder;
}

export function stopStoreFeeder(): void {
  activeFeeder?.stop();
  activeFeeder = null;
}

export function getActiveFeeder(): StoreFeeder | null {
  return activeFeeder;
}
