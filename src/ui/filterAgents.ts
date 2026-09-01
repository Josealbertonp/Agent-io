import { AgentStatus, AgentStatusSchema } from '../contracts';

export type StatusFilterValue = 'all' | AgentStatus;

export const STATUS_FILTER_OPTIONS: readonly StatusFilterValue[] = [
  'all',
  ...AgentStatusSchema.options,
];

export function filterAgentsByStatus<T extends { status: AgentStatus }>(
  agents: readonly T[],
  filter: StatusFilterValue
): T[] {
  if (filter === 'all') return [...agents];
  return agents.filter((agent) => agent.status === filter);
}

export function eventMatchesStatusFilter(
  event: { type: string; entityId?: string; actorId?: string; payload: Record<string, unknown> },
  filter: StatusFilterValue,
  agentStatusById: Record<string, AgentStatus>
): boolean {
  if (filter === 'all') return true;
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
