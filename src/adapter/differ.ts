import { Event } from '../contracts';
import { WorkspaceSnapshot, NormalizedAgentState } from './types';
import { hashString } from './parser';

/**
 * Gera um eventId determinístico.
 * Seed = type + entityId + transição estável + workspaceId.
 * SEM timestamp de poll — o mesmo diff lógico sempre produz o mesmo eventId.
 */
export function generateDeterministicEventId(
  type: string,
  entityId: string,
  workspaceId: string,
  transition: string = ''
): string {
  const seed = `${type}:${entityId}:${transition}:${workspaceId}`;
  return `evt-${hashString(seed)}`;
}

/**
 * Calcula a lista de eventos canônicos resultantes da diferença entre dois snapshots consecutivos.
 *
 * A CLI Maestri não expõe tarefas: `currentTaskId` ausente NÃO gera `task.*`.
 */
export function diffSnapshots(
  prev: WorkspaceSnapshot | null,
  curr: WorkspaceSnapshot,
  startSequence: number = 1
): { events: Event[]; nextSequence: number } {
  const events: Event[] = [];
  let seq = startSequence;
  const occurredAt = curr.timestamp;
  const workspaceId = curr.workspaceId;

  if (!prev || prev.connectionStatus !== curr.connectionStatus) {
    const previousStatus = prev?.connectionStatus || 'disconnected';
    const transition = `${previousStatus}->${curr.connectionStatus}`;
    const eventId = generateDeterministicEventId(
      'connection.status_changed',
      workspaceId,
      workspaceId,
      transition
    );
    events.push({
      eventId,
      version: 1,
      type: 'connection.status_changed',
      occurredAt,
      sequence: seq++,
      workspaceId,
      source: 'maestri',
      entityType: 'connection',
      entityId: workspaceId,
      payload: {
        status: curr.connectionStatus,
        previousStatus,
      },
    });
  }

  const prevAgents = prev?.agents || {};
  const currAgents = curr.agents;

  for (const [agentId, currAgent] of Object.entries(currAgents)) {
    const prevAgent = prevAgents[agentId] as NormalizedAgentState | undefined;

    if (!prevAgent) {
      const eventId = generateDeterministicEventId(
        'agent.connected',
        agentId,
        workspaceId,
        'absent->present'
      );
      events.push({
        eventId,
        version: 1,
        type: 'agent.connected',
        occurredAt,
        sequence: seq++,
        workspaceId,
        source: 'maestri',
        actorId: agentId,
        entityType: 'agent',
        entityId: agentId,
        payload: {
          name: currAgent.name,
          provider: currAgent.provider,
          model: currAgent.model,
          providerKnown: currAgent.providerKnown,
          role: currAgent.role,
          status: currAgent.status,
          position: currAgent.position,
          statusConfidence: currAgent.statusConfidence,
          statusEvidence: currAgent.statusEvidence,
          // Opção A (Etapa 4): extras de inferência no payload, NÃO no schema Agent.
          ...(currAgent.currentActivity ? { currentActivity: currAgent.currentActivity } : {}),
        },
      });

      if (currAgent.currentActivity) {
        const actId = `act-${agentId}-${hashString(currAgent.currentActivity)}`;
        const actEventId = generateDeterministicEventId(
          'activity.started',
          actId,
          workspaceId,
          currAgent.currentActivity
        );
        events.push({
          eventId: actEventId,
          version: 1,
          type: 'activity.started',
          occurredAt,
          sequence: seq++,
          workspaceId,
          source: 'maestri',
          actorId: agentId,
          entityType: 'activity',
          entityId: actId,
          payload: {
            agentId,
            type: currAgent.currentActivity,
            startedAt: occurredAt,
            sourceEventId: eventId,
          },
        });
      }
    } else {
      if (prevAgent.status !== currAgent.status) {
        const transition = `${prevAgent.status}->${currAgent.status}`;
        const eventId = generateDeterministicEventId(
          'agent.status_changed',
          agentId,
          workspaceId,
          transition
        );
        events.push({
          eventId,
          version: 1,
          type: 'agent.status_changed',
          occurredAt,
          sequence: seq++,
          workspaceId,
          source: 'maestri',
          actorId: agentId,
          entityType: 'agent',
          entityId: agentId,
          payload: {
            previousStatus: prevAgent.status,
            currentStatus: currAgent.status,
            currentTaskId: currAgent.currentTaskId,
            statusConfidence: currAgent.statusConfidence,
            statusEvidence: currAgent.statusEvidence,
            ...(currAgent.currentActivity ? { currentActivity: currAgent.currentActivity } : {}),
          },
        });
      }

      if (prevAgent.currentActivity !== currAgent.currentActivity && currAgent.currentActivity) {
        const actId = `act-${agentId}-${hashString(currAgent.currentActivity)}`;
        const actEventId = generateDeterministicEventId(
          'activity.started',
          actId,
          workspaceId,
          currAgent.currentActivity
        );
        events.push({
          eventId: actEventId,
          version: 1,
          type: 'activity.started',
          occurredAt,
          sequence: seq++,
          workspaceId,
          source: 'maestri',
          actorId: agentId,
          entityType: 'activity',
          entityId: actId,
          payload: {
            agentId,
            type: currAgent.currentActivity,
            startedAt: occurredAt,
            sourceEventId: actEventId,
          },
        });
      }
    }
  }

  for (const [agentId, prevAgent] of Object.entries(prevAgents)) {
    if (!currAgents[agentId]) {
      const eventId = generateDeterministicEventId(
        'agent.disconnected',
        agentId,
        workspaceId,
        'present->absent'
      );
      events.push({
        eventId,
        version: 1,
        type: 'agent.disconnected',
        occurredAt,
        sequence: seq++,
        workspaceId,
        source: 'maestri',
        actorId: agentId,
        entityType: 'agent',
        entityId: agentId,
        payload: {
          name: prevAgent.name,
          reason: 'disconnected_from_workspace',
        },
      });
    }
  }

  return { events, nextSequence: seq };
}
