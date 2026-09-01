import { z } from 'zod';
import { TaskStatusSchema } from './enums';

export const TaskSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: z.number().optional(),
  ownerAgentId: z.string().optional(),
  participantAgentIds: z.array(z.string()).default([]),
  dependencyIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  links: z.array(z.string()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;
