import { ProjectedState, SnapshotEnvelope } from './types';

export const CURRENT_SNAPSHOT_VERSION = 1;

/**
 * Serializa o estado projetado em formato JSON estruturado com envelope de versão e metadados.
 */
export function serializeState(state: ProjectedState): string {
  const envelope: SnapshotEnvelope = {
    version: CURRENT_SNAPSHOT_VERSION,
    timestamp: new Date().toISOString(),
    state: {
      agents: state.agents,
      tasks: state.tasks,
      activities: state.activities,
      connectionStatus: state.connectionStatus,
      seenEventIds: Array.from(state.seenEventIds),
      pendingOrphanEvents: state.pendingOrphanEvents,
      lastSequence: state.lastSequence,
      lastOccurredAt: state.lastOccurredAt,
      ignoredEventsCount: state.ignoredEventsCount,
      rejectedEventsCount: state.rejectedEventsCount,
      invalidPayloadCount: state.invalidPayloadCount,
      droppedOrphanEventsCount: state.droppedOrphanEventsCount,
    },
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Desserializa um JSON gerado pelo serializeState restaurando os tipos em memória.
 * Rejeita explicitamente snapshots com version != CURRENT_SNAPSHOT_VERSION.
 */
export function deserializeState(jsonString: string): ProjectedState {
  const parsed = JSON.parse(jsonString) as SnapshotEnvelope | ProjectedState;

  // Validação estrita de versão do snapshot
  if ('version' in parsed && parsed.version !== CURRENT_SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot version mismatch: expected ${CURRENT_SNAPSHOT_VERSION}, got ${parsed.version}`
    );
  }

  const source = 'state' in parsed && parsed.state ? parsed.state : (parsed as ProjectedState);

  const seenIds = Array.isArray(source.seenEventIds)
    ? new Set<string>(source.seenEventIds)
    : source.seenEventIds instanceof Set
    ? source.seenEventIds
    : new Set<string>();

  const pendingOrphans = Array.isArray(source.pendingOrphanEvents)
    ? source.pendingOrphanEvents
    : [];

  return {
    agents: source.agents || {},
    tasks: source.tasks || {},
    activities: source.activities || {},
    connectionStatus: source.connectionStatus || 'disconnected',
    seenEventIds: seenIds,
    pendingOrphanEvents: pendingOrphans,
    lastSequence: source.lastSequence,
    lastOccurredAt: source.lastOccurredAt,
    ignoredEventsCount: typeof source.ignoredEventsCount === 'number' ? source.ignoredEventsCount : 0,
    rejectedEventsCount: typeof source.rejectedEventsCount === 'number' ? source.rejectedEventsCount : 0,
    invalidPayloadCount: typeof source.invalidPayloadCount === 'number' ? source.invalidPayloadCount : 0,
    droppedOrphanEventsCount: typeof source.droppedOrphanEventsCount === 'number' ? source.droppedOrphanEventsCount : 0,
  };
}
