import { AdapterCheckpoint, NormalizedAgentState, WorkspaceSnapshot } from './types';
import { ConnectionStatusSchema } from '../contracts';

export const CHECKPOINT_VERSION = 2;
export const EMITTED_EVENT_IDS_CAP = 5000;

/**
 * Checkpoint vazio. Módulo puro — sem I/O, sem node:*.
 */
export function createInitialCheckpoint(): AdapterCheckpoint {
  return {
    version: CHECKPOINT_VERSION,
    lastSequence: 0,
    lastOccurredAt: undefined,
    lastSnapshotHash: undefined,
    lastSnapshot: undefined,
    emittedEventIds: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mantém os IDs mais recentes até `cap` (FIFO: descarta os mais antigos).
 */
export function capEmittedEventIds(
  ids: readonly string[],
  cap: number = EMITTED_EVENT_IDS_CAP
): string[] {
  if (ids.length <= cap) return [...ids];
  return ids.slice(ids.length - cap);
}

/**
 * Acrescenta um eventId no fim, ignorando duplicata, respeitando o teto FIFO.
 */
export function mergeEmittedEventId(
  ids: readonly string[],
  eventId: string,
  cap: number = EMITTED_EVENT_IDS_CAP
): string[] {
  if (ids.includes(eventId)) return capEmittedEventIds(ids, cap);
  return capEmittedEventIds([...ids, eventId], cap);
}

export function serializeCheckpoint(checkpoint: AdapterCheckpoint): string {
  const normalized: AdapterCheckpoint = {
    ...checkpoint,
    version: CHECKPOINT_VERSION,
    emittedEventIds: capEmittedEventIds(checkpoint.emittedEventIds),
  };
  return JSON.stringify(normalized, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNormalizedAgent(value: unknown): NormalizedAgentState | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.workspaceId !== 'string') return null;
  if (typeof value.name !== 'string' || typeof value.role !== 'string') return null;
  if (typeof value.status !== 'string') return null;
  if (!isRecord(value.position) || typeof value.position.x !== 'number' || typeof value.position.y !== 'number') {
    return null;
  }

  return {
    id: value.id,
    workspaceId: value.workspaceId,
    name: value.name,
    provider: typeof value.provider === 'string' ? value.provider : 'unknown',
    model: typeof value.model === 'string' ? value.model : 'unknown',
    providerKnown: value.providerKnown === true,
    role: value.role,
    status: value.status as NormalizedAgentState['status'],
    statusConfidence:
      value.statusConfidence === 'low' || value.statusConfidence === 'medium' || value.statusConfidence === 'high'
        ? value.statusConfidence
        : 'low',
    statusEvidence: typeof value.statusEvidence === 'string' ? value.statusEvidence : '',
    currentTaskId: typeof value.currentTaskId === 'string' ? value.currentTaskId : undefined,
    currentActivity: typeof value.currentActivity === 'string' ? value.currentActivity : undefined,
    lastActivityAt: typeof value.lastActivityAt === 'string' ? value.lastActivityAt : undefined,
    position: { x: value.position.x, y: value.position.y },
  };
}

function parseWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.workspaceId !== 'string' || typeof value.timestamp !== 'string') return undefined;
  if (typeof value.rawHash !== 'string') return undefined;

  const connection = ConnectionStatusSchema.safeParse(value.connectionStatus);
  if (!connection.success) return undefined;
  if (!isRecord(value.agents)) return undefined;

  const agents: Record<string, NormalizedAgentState> = {};
  for (const [id, agentValue] of Object.entries(value.agents)) {
    const agent = parseNormalizedAgent(agentValue);
    if (agent) agents[id] = agent;
  }

  return {
    workspaceId: value.workspaceId,
    timestamp: value.timestamp,
    connectionStatus: connection.data,
    agents,
    rawHash: value.rawHash,
  };
}

/**
 * Hidrata um checkpoint a partir de JSON (v1 sem snapshot ou v2). Campos inválidos caem no default.
 */
export function parseCheckpoint(raw: unknown): AdapterCheckpoint {
  const initial = createInitialCheckpoint();
  if (!isRecord(raw)) return initial;

  const emitted = Array.isArray(raw.emittedEventIds)
    ? capEmittedEventIds(raw.emittedEventIds.filter((id): id is string => typeof id === 'string'))
    : [];

  const lastSequence = typeof raw.lastSequence === 'number' && Number.isFinite(raw.lastSequence)
    ? raw.lastSequence
    : 0;

  return {
    version: CHECKPOINT_VERSION,
    lastSequence,
    lastOccurredAt: typeof raw.lastOccurredAt === 'string' ? raw.lastOccurredAt : undefined,
    lastSnapshotHash: typeof raw.lastSnapshotHash === 'string' ? raw.lastSnapshotHash : undefined,
    lastSnapshot: parseWorkspaceSnapshot(raw.lastSnapshot),
    emittedEventIds: emitted,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : initial.updatedAt,
  };
}

export function restoreLastSnapshot(checkpoint: AdapterCheckpoint): WorkspaceSnapshot | null {
  return checkpoint.lastSnapshot ?? null;
}
