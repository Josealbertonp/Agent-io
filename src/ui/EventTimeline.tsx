import { Agent, Event } from '../contracts';
import { statusVisualFor } from '../view/statusVisual';
import { formatOccurredAt } from './displayLabels';
import { eventMatchesStatusFilter, StatusFilterValue } from './filterAgents';

export interface EventTimelineProps {
  events: readonly Event[];
  agents: Record<string, Agent>;
  statusFilter: StatusFilterValue;
}

function relatedStatus(event: Event): string | undefined {
  const raw = event.payload.currentStatus ?? event.payload.status;
  return typeof raw === 'string' ? raw : undefined;
}

function agentLabel(event: Event, agents: Record<string, Agent>): string {
  const id =
    (typeof event.payload.agentId === 'string' ? event.payload.agentId : undefined) ??
    (event.entityType === 'agent' ? event.entityId : undefined) ??
    event.actorId;
  if (!id) return '—';
  return agents[id]?.name ?? id;
}

function describeEvent(event: Event): string {
  const payload = event.payload;
  switch (event.type) {
    case 'agent.connected':
      return `conectou${typeof payload.name === 'string' ? ` (${payload.name})` : ''}`;
    case 'agent.disconnected':
      return 'desconectou';
    case 'agent.status_changed':
      return `status: ${String(payload.previousStatus ?? '?')} → ${String(payload.currentStatus ?? payload.status ?? '?')}`;
    case 'activity.started':
      return `atividade: ${String(payload.type ?? payload.currentActivity ?? 'sem dado')}`;
    case 'activity.finished':
      return 'atividade encerrada';
    case 'connection.status_changed':
      return `conexão: ${String(payload.previousStatus ?? '?')} → ${String(payload.status ?? '?')}`;
    default:
      return event.type;
  }
}

function sortByTime(events: readonly Event[]): Event[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    if (ta !== tb) return tb - ta;
    const sa = a.sequence ?? 0;
    const sb = b.sequence ?? 0;
    if (sa !== sb) return sb - sa;
    return b.eventId.localeCompare(a.eventId);
  });
}

export function EventTimeline({ events, agents, statusFilter }: EventTimelineProps) {
  const agentStatusById = Object.fromEntries(
    Object.values(agents).map((agent) => [agent.id, agent.status])
  );
  const visible = sortByTime(events).filter((event) =>
    eventMatchesStatusFilter(event, statusFilter, agentStatusById)
  );

  if (events.length === 0) {
    return (
      <section className="event-timeline" data-testid="event-timeline">
        <h2>Timeline</h2>
        <p className="empty-state" data-testid="empty-timeline">
          Nenhum evento ainda.
        </p>
      </section>
    );
  }

  return (
    <section className="event-timeline" data-testid="event-timeline">
      <h2>Timeline</h2>
      <ol className="event-timeline__list">
        {visible.map((event) => {
          const status = relatedStatus(event);
          const visual = status ? statusVisualFor(status) : null;
          return (
            <li
              key={event.eventId}
              className="event-timeline__item"
              data-testid={`timeline-item-${event.eventId}`}
            >
              <span
                className="status-dot"
                style={{ background: visual?.hex ?? '#6b7280' }}
                aria-hidden
              >
                {visual?.icon ?? '·'}
              </span>
              <span className="event-timeline__time">{formatOccurredAt(event.occurredAt)}</span>
              <span className="event-timeline__agent">{agentLabel(event, agents)}</span>
              <span className="event-timeline__type">{event.type}</span>
              <span className="event-timeline__desc">{describeEvent(event)}</span>
              {status ? (
                <span className="event-timeline__status" style={{ color: visual?.hex }}>
                  {visual?.label ?? status}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
