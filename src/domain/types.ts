import {
  Agent,
  Task,
  Activity,
  ConnectionStatus,
  Event,
} from '../contracts';

export const MAX_PENDING_ORPHAN_EVENTS = 1000;

export type ReductionResult = 'applied' | 'orphan' | 'invalid';

export interface ProjectedState {
  agents: Record<string, Agent>;
  tasks: Record<string, Task>;
  activities: Record<string, Activity>;
  connectionStatus: ConnectionStatus;
  seenEventIds: Set<string>;
  pendingOrphanEvents: Event[];
  lastSequence?: number;
  lastOccurredAt?: string;
  ignoredEventsCount: number;
  rejectedEventsCount: number;
  invalidPayloadCount: number;
  droppedOrphanEventsCount: number;
}

export interface SerializedProjectedState {
  agents: Record<string, Agent>;
  tasks: Record<string, Task>;
  activities: Record<string, Activity>;
  connectionStatus: ConnectionStatus;
  seenEventIds: string[];
  pendingOrphanEvents: Event[];
  lastSequence?: number;
  lastOccurredAt?: string;
  ignoredEventsCount: number;
  rejectedEventsCount: number;
  invalidPayloadCount: number;
  droppedOrphanEventsCount: number;
}

export interface SnapshotEnvelope {
  version: number;
  timestamp: string;
  state: SerializedProjectedState;
}

export type { Agent, Task, Activity, ConnectionStatus, Event };
