import { z } from 'zod';

export const ActivitySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  type: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).optional(),
  sourceEventId: z.string().min(1),
});

export type Activity = z.infer<typeof ActivitySchema>;
