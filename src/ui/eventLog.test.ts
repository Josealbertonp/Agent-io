import { describe, expect, it, beforeEach } from 'vitest';
import { Event } from '../contracts';
import {
  appendPresentationEvents,
  getPresentationEvents,
  PRESENTATION_EVENT_LOG_CAP,
  resetEventLog,
} from './eventLog';
import { extrasFromEvents } from './agentExtras';

function evt(partial: Partial<Event> & Pick<Event, 'eventId' | 'type'>): Event {
  return {
    version: 1,
    occurredAt: partial.occurredAt ?? '2026-08-31T12:00:00.000Z',
    workspaceId: 'ws-1',
    source: 'test',
    payload: {},
    ...partial,
  };
}

describe('eventLog de apresentação', () => {
  beforeEach(() => {
    resetEventLog();
  });

  it('anexa eventos e ordena por tempo (mais recente primeiro na leitura bruta + cap FIFO)', () => {
    appendPresentationEvents([
      evt({ eventId: 'a', type: 'agent.connected', occurredAt: '2026-08-31T12:00:00.000Z' }),
      evt({ eventId: 'b', type: 'agent.status_changed', occurredAt: '2026-08-31T12:01:00.000Z' }),
    ]);
    expect(getPresentationEvents().map((e) => e.eventId)).toEqual(['a', 'b']);
  });

  it('ring buffer limita em 200 (FIFO)', () => {
    const batch = Array.from({ length: PRESENTATION_EVENT_LOG_CAP + 5 }, (_, i) =>
      evt({ eventId: `e-${i}`, type: 'agent.status_changed', sequence: i })
    );
    appendPresentationEvents(batch);
    const stored = getPresentationEvents();
    expect(stored).toHaveLength(PRESENTATION_EVENT_LOG_CAP);
    expect(stored[0].eventId).toBe('e-5');
    expect(stored.at(-1)?.eventId).toBe(`e-${PRESENTATION_EVENT_LOG_CAP + 4}`);
  });

  it('deduplica por eventId (replay SSE não duplica linha)', () => {
    const once = evt({ eventId: 'dup-1', type: 'agent.connected' });
    appendPresentationEvents([once, once]);
    appendPresentationEvents([once]);
    expect(getPresentationEvents()).toHaveLength(1);
    expect(getPresentationEvents()[0].eventId).toBe('dup-1');
  });

  it('extras vêm do payload mais recente — sem inventar', () => {
    appendPresentationEvents([
      evt({
        eventId: 'c1',
        type: 'agent.connected',
        entityId: 'agent-dev',
        payload: {
          statusConfidence: 'high',
          statusEvidence: 'office-demo',
          currentActivity: 'implementando',
        },
      }),
    ]);
    expect(extrasFromEvents('agent-dev', getPresentationEvents())).toEqual({
      statusConfidence: 'high',
      statusEvidence: 'office-demo',
      currentActivity: 'implementando',
    });
    expect(extrasFromEvents('agent-other', getPresentationEvents())).toEqual({
      statusConfidence: null,
      statusEvidence: null,
      currentActivity: null,
    });
  });
});
