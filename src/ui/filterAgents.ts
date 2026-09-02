import { AgentStatus, AgentStatusSchema } from '../contracts';

export type StatusFilterValue = 'all' | 'online' | AgentStatus;

export const PRESENCE_FILTER_OPTIONS = ['all', 'online', 'offline'] as const satisfies readonly StatusFilterValue[];

export const ACTIVITY_FILTER_OPTIONS = [
  'working',
  'planning',
  'waiting',
  'blocked',
  'reviewing',
  'done',
  'error',
  'idle',
] as const satisfies readonly StatusFilterValue[];

export const STATUS_FILTER_OPTIONS: readonly StatusFilterValue[] = [
  'all',
  'online',
  ...AgentStatusSchema.options,
];

export function filterAgentsByStatus<T extends { status: AgentStatus }>(
  agents: readonly T[],
  filter: StatusFilterValue
): T[] {
  if (filter === 'all') return [...agents];
  if (filter === 'online') return agents.filter((agent) => agent.status !== 'offline');
  return agents.filter((agent) => agent.status === filter);
}

export function eventMatchesStatusFilter(
  event: { type: string; entityId?: string; actorId?: string; payload: Record<string, unknown> },
  filter: StatusFilterValue,
  agentStatusById: Record<string, AgentStatus>
): boolean {
  if (filter === 'all') return true;
  if (filter === 'online') {
    const agentId =
      (typeof event.payload.agentId === 'string' ? event.payload.agentId : undefined) ??
      event.entityId ??
      event.actorId;
    const relatedStatus =
      (typeof event.payload.currentStatus === 'string' ? event.payload.currentStatus : undefined) ??
      (typeof event.payload.status === 'string' ? event.payload.status : undefined);
    if (relatedStatus === 'offline') return false;
    if (agentId && agentStatusById[agentId] === 'offline') return false;
    return true;
  }
  if (event.type === 'connection.status_changed') return true;

  const relatedStatus =
    (typeof event.payload.currentStatus === 'string' ? event.payload.currentStatus : undefined) ??
    (typeof event.payload.status === 'string' ? event.payload.status : undefined);

  if (relatedStatus === filter) return true;

  const agentId =
    (typeof event.payload.agentId === 'string' ? event.payload.agentId : undefined) ??
    event.entityId ??
    event.actorId;
  if (agentId && agentStatusById[agentId] === filter) return true;

  return false;
}
