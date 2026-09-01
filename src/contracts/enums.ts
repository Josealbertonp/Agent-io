import { z } from 'zod';

export const AgentStatusSchema = z.enum([
  'offline',
  'idle',
  'planning',
  'working',
  'waiting',
  'blocked',
  'reviewing',
  'done',
  'error',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const TaskStatusSchema = z.enum([
  'backlog',
  'ready',
  'in_progress',
  'review',
  'blocked',
  'done',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ConnectionStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
  'degraded',
  'error',
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
