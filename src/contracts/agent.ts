import { z } from 'zod';
import { AgentStatusSchema } from './enums';

export const AgentPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type AgentPosition = z.infer<typeof AgentPositionSchema>;

export const AgentSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  role: z.string().min(1),
  status: AgentStatusSchema,
  currentTaskId: z.string().optional(),
  position: AgentPositionSchema,
  lastActivityAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Agent = z.infer<typeof AgentSchema>;
