import { describe, expect, it } from 'vitest';
import {
  EventSchema,
  AgentSchema,
  TaskSchema,
  ActivitySchema,
} from '../contracts';
import { sampleEvents } from './events.sample';

describe('Contracts & Fixtures Validation', () => {
  it('should have at least 10 sample events', () => {
    expect(sampleEvents.length).toBeGreaterThanOrEqual(10);
  });

  it('should validate every sample event against EventSchema without throwing', () => {
    sampleEvents.forEach((evt) => {
      const parsed = EventSchema.parse(evt);
      expect(parsed.eventId).toBe(evt.eventId);
      expect(parsed.version).toBe(1);
      expect(typeof parsed.type).toBe('string');
      expect(typeof parsed.occurredAt).toBe('string');
      expect(parsed.workspaceId).toBe(evt.workspaceId);
      expect(parsed.source).toBe(evt.source);
      expect(parsed.payload).toBeDefined();
    });
  });

  it('should validate canonical Agent contract', () => {
    const validAgent = {
      id: 'agent-01',
      workspaceId: 'ws-main',
      name: 'Test Agent',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      role: 'Engineer',
      status: 'idle',
      position: { x: 10, y: 20 },
      lastActivityAt: '2026-08-31T12:00:00.000Z',
      metadata: { department: 'AI Lab' },
    };

    const parsed = AgentSchema.parse(validAgent);
    expect(parsed.id).toBe('agent-01');
    expect(parsed.status).toBe('idle');
  });

  it('should validate canonical Task contract with defaults', () => {
    const validTask = {
      id: 'task-01',
      workspaceId: 'ws-main',
      title: 'Initialize workspace',
      status: 'backlog',
      createdAt: '2026-08-31T12:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    };

    const parsed = TaskSchema.parse(validTask);
    expect(parsed.participantAgentIds).toEqual([]);
    expect(parsed.dependencyIds).toEqual([]);
    expect(parsed.status).toBe('backlog');
  });

  it('should validate canonical Activity contract', () => {
    const validActivity = {
      id: 'act-01',
      agentId: 'agent-01',
      type: 'reviewing_code',
      startedAt: '2026-08-31T12:00:00.000Z',
      sourceEventId: 'evt-001',
    };

    const parsed = ActivitySchema.parse(validActivity);
    expect(parsed.id).toBe('act-01');
    expect(parsed.endedAt).toBeUndefined();
  });

  describe('Negative & Edge Case Validation (Step 0.1)', () => {
    it('should reject an Agent with invalid status', () => {
      const invalidAgent = {
        id: 'agent-02',
        workspaceId: 'ws-main',
        name: 'Invalid Agent',
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        role: 'Tester',
        status: 'banana',
        position: { x: 0, y: 0 },
      };

      expect(() => AgentSchema.parse(invalidAgent)).toThrow();
    });

    it('should accept valid Events with ISO 8601 timestamps having offsets (+00:00 and -03:00)', () => {
      const eventWithUtcOffset = {
        eventId: 'evt-offset-1',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T12:00:00+00:00',
        workspaceId: 'ws-main',
        source: 'maestri',
        payload: { status: 'idle' },
      };

      const eventWithLocalOffset = {
        eventId: 'evt-offset-2',
        version: 1,
        type: 'agent.status_changed',
        occurredAt: '2026-08-31T09:00:00-03:00',
        workspaceId: 'ws-main',
        source: 'maestri',
        payload: { status: 'working' },
      };

      expect(() => EventSchema.parse(eventWithUtcOffset)).not.toThrow();
      expect(() => EventSchema.parse(eventWithLocalOffset)).not.toThrow();
    });

    it('should accept unknown/future event types as open string in Event.type', () => {
      const futureEvent = {
        eventId: 'evt-future-01',
        version: 1,
        type: 'custom.future_module_event',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-main',
        source: 'custom_plugin',
        payload: { customField: true },
      };

      expect(() => EventSchema.parse(futureEvent)).not.toThrow();
    });

    it('should reject an Event without a payload or missing required envelope fields', () => {
      const eventWithoutPayload = {
        eventId: 'evt-no-payload',
        version: 1,
        type: 'task.created',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-main',
        source: 'maestri',
      };

      expect(() => EventSchema.parse(eventWithoutPayload)).toThrow();
    });

    it('should reject a Task with invalid status', () => {
      const invalidTask = {
        id: 'task-err',
        workspaceId: 'ws-main',
        title: 'Bad Task',
        status: 'invalid_status_value',
        createdAt: '2026-08-31T12:00:00.000Z',
        updatedAt: '2026-08-31T12:00:00.000Z',
      };

      expect(() => TaskSchema.parse(invalidTask)).toThrow();
    });
  });
});
