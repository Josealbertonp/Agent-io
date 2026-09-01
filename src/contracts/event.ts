import { z } from 'zod';

export const KNOWN_EVENT_TYPES = [
  'agent.connected',
  'agent.disconnected',
  'agent.status_changed',
  'task.created',
  'task.assigned',
  'task.status_changed',
  'task.completed',
  'activity.started',
  'activity.finished',
  'connection.status_changed',
] as const;

// Catálogo auxiliar de tipos conhecidos (ex: telemetria, UI).
// Event.type é uma STRING ABERTA e NÃO deve ser validada contra este enum fechado,
// permitindo a aceitação de eventos futuros/desconhecidos sem quebrar o parse.
export const KnownEventTypeSchema = z.enum(KNOWN_EVENT_TYPES);
export type KnownEventType = z.infer<typeof KnownEventTypeSchema>;

export const EntityTypeSchema = z.enum(['agent', 'task', 'activity', 'connection']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EventSchema = z.object({
  eventId: z.string().min(1),
  version: z.number().int().min(1).default(1),
  type: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  sequence: z.number().int().optional(),
  workspaceId: z.string().min(1),
  source: z.string().min(1),
  correlationId: z.string().optional(),
  actorId: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
  entityId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type Event = z.infer<typeof EventSchema>;
