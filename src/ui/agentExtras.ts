import { Event } from '../contracts';

/**
 * Campos de inferência do adapter que NÃO entram no Agent canônico.
 * Lidos do eventLog de apresentação (payload do evento mais recente por agente).
 * Se o payload não trouxer o campo, permanece null — a UI mostra "sem dado".
 */
export interface AgentPresentationExtras {
  statusConfidence: string | null;
  statusEvidence: string | null;
  currentActivity: string | null;
}

function eventMentionsAgent(event: Event, agentId: string): boolean {
  if (event.entityId === agentId || event.actorId === agentId) return true;
  return event.payload.agentId === agentId;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function extrasFromEvents(
  agentId: string,
  events: readonly Event[]
): AgentPresentationExtras {
  let statusConfidence: string | null = null;
  let statusEvidence: string | null = null;
  let currentActivity: string | null = null;

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!eventMentionsAgent(event, agentId)) continue;

    if (event.type === 'activity.started' && currentActivity === null) {
      currentActivity = readString(event.payload, 'type') ?? readString(event.payload, 'currentActivity');
      continue;
    }

    if (event.type === 'agent.connected' || event.type === 'agent.status_changed') {
      if (statusConfidence === null) {
        statusConfidence = readString(event.payload, 'statusConfidence');
      }
      if (statusEvidence === null) {
        statusEvidence = readString(event.payload, 'statusEvidence');
      }
      if (currentActivity === null) {
        currentActivity = readString(event.payload, 'currentActivity');
      }
    }

    if (statusConfidence && statusEvidence && currentActivity) break;
  }

  return { statusConfidence, statusEvidence, currentActivity };
}
