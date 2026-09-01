import {
  Agent,
  AgentStatus,
  AgentStatusSchema,
  Task,
  TaskStatus,
  TaskStatusSchema,
  Activity,
  ConnectionStatusSchema,
  Event,
} from '../contracts';
import { ProjectedState, ReductionResult } from './types';

export function reduceAgentConnected(state: ProjectedState, event: Event): ReductionResult {
  const agentId =
    event.entityId ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    event.actorId ||
    '';

  if (!agentId) return 'invalid';

  const position = (event.payload.position &&
  typeof event.payload.position === 'object' &&
  'x' in event.payload.position &&
  'y' in event.payload.position
    ? event.payload.position
    : { x: 0, y: 0 }) as { x: number; y: number };

  const existing = state.agents[agentId];

  // Validação Zod estrita de AgentStatus
  let status: AgentStatus = 'idle';
  if ('status' in event.payload) {
    const parsed = AgentStatusSchema.safeParse(event.payload.status);
    if (parsed.success) {
      status = parsed.data;
    } else {
      state.invalidPayloadCount++;
      status = existing?.status || 'idle';
    }
  } else if (existing) {
    status = existing.status;
  }

  const agent: Agent = {
    id: agentId,
    workspaceId: event.workspaceId,
    name: typeof event.payload.name === 'string' ? event.payload.name : existing?.name || agentId,
    provider: typeof event.payload.provider === 'string' ? event.payload.provider : existing?.provider || 'unknown',
    model: typeof event.payload.model === 'string' ? event.payload.model : existing?.model || 'unknown',
    role: typeof event.payload.role === 'string' ? event.payload.role : existing?.role || 'agent',
    status,
    currentTaskId: typeof event.payload.currentTaskId === 'string' ? event.payload.currentTaskId : existing?.currentTaskId,
    position,
    lastActivityAt: typeof event.payload.lastActivityAt === 'string' ? event.payload.lastActivityAt : event.occurredAt,
    metadata: event.payload.metadata && typeof event.payload.metadata === 'object'
      ? (event.payload.metadata as Record<string, unknown>)
      : existing?.metadata,
  };

  state.agents[agentId] = agent;
  return 'applied';
}

export function reduceAgentDisconnected(state: ProjectedState, event: Event): ReductionResult {
  const agentId =
    event.entityId ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    event.actorId ||
    '';

  if (!agentId) return 'invalid';

  const existing = state.agents[agentId];
  if (!existing) {
    // Id-alvo presente, mas entidade não existe: evento órfão
    return 'orphan';
  }

  state.agents[agentId] = {
    ...existing,
    status: 'offline',
    lastActivityAt: event.occurredAt,
  };
  return 'applied';
}

export function reduceAgentStatusChanged(state: ProjectedState, event: Event): ReductionResult {
  const agentId =
    event.entityId ||
    (typeof event.payload.agentId === 'string' ? event.payload.agentId : undefined) ||
    event.actorId ||
    '';

  if (!agentId) return 'invalid';

  const existing = state.agents[agentId];
  if (!existing) {
    // Id-alvo presente, mas entidade ainda não criada: evento órfão
    return 'orphan';
  }

  const rawStatus = event.payload.currentStatus || event.payload.status;
  let statusToApply = existing.status;

  if (rawStatus !== undefined) {
    const parsed = AgentStatusSchema.safeParse(rawStatus);
    if (parsed.success) {
      statusToApply = parsed.data;
    } else {
      state.invalidPayloadCount++;
    }
  }

  const updated: Agent = {
    ...existing,
    status: statusToApply,
    lastActivityAt: event.occurredAt,
  };

  if ('currentTaskId' in event.payload) {
    updated.currentTaskId = typeof event.payload.currentTaskId === 'string' ? event.payload.currentTaskId : undefined;
  }

  if (event.payload.position && typeof event.payload.position === 'object') {
    const pos = event.payload.position as { x: number; y: number };
    if (typeof pos.x === 'number' && typeof pos.y === 'number') {
      updated.position = pos;
    }
  }

  state.agents[agentId] = updated;
  return 'applied';
}

export function reduceTaskCreated(state: ProjectedState, event: Event): ReductionResult {
  const taskId =
    event.entityId ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    '';

  if (!taskId) return 'invalid';

  let status: TaskStatus = 'ready';
  if ('status' in event.payload) {
    const parsed = TaskStatusSchema.safeParse(event.payload.status);
    if (parsed.success) {
      status = parsed.data;
    } else {
      state.invalidPayloadCount++;
      status = 'ready';
    }
  }

  const task: Task = {
    id: taskId,
    workspaceId: event.workspaceId,
    title: typeof event.payload.title === 'string' ? event.payload.title : 'Untitled Task',
    description: typeof event.payload.description === 'string' ? event.payload.description : undefined,
    status,
    priority: typeof event.payload.priority === 'number' ? event.payload.priority : undefined,
    ownerAgentId: typeof event.payload.ownerAgentId === 'string' ? event.payload.ownerAgentId : undefined,
    participantAgentIds: Array.isArray(event.payload.participantAgentIds)
      ? (event.payload.participantAgentIds as string[])
      : [],
    dependencyIds: Array.isArray(event.payload.dependencyIds)
      ? (event.payload.dependencyIds as string[])
      : [],
    createdAt: typeof event.payload.createdAt === 'string' ? event.payload.createdAt : event.occurredAt,
    updatedAt: typeof event.payload.updatedAt === 'string' ? event.payload.updatedAt : event.occurredAt,
    startedAt: typeof event.payload.startedAt === 'string' ? event.payload.startedAt : undefined,
    completedAt: typeof event.payload.completedAt === 'string' ? event.payload.completedAt : undefined,
    links: Array.isArray(event.payload.links) ? (event.payload.links as string[]) : undefined,
  };

  state.tasks[taskId] = task;
  return 'applied';
}

export function reduceTaskAssigned(state: ProjectedState, event: Event): ReductionResult {
  const taskId =
    event.entityId ||
    (typeof event.payload.taskId === 'string' ? event.payload.taskId : undefined) ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    '';

  if (!taskId) return 'invalid';

  const existing = state.tasks[taskId];
  if (!existing) {
    // Id-alvo presente, mas entidade ainda não criada: evento órfão
    return 'orphan';
  }

  const updated: Task = {
    ...existing,
    updatedAt: typeof event.payload.updatedAt === 'string' ? event.payload.updatedAt : event.occurredAt,
  };

  if (typeof event.payload.ownerAgentId === 'string') {
    updated.ownerAgentId = event.payload.ownerAgentId;
  }

  if (Array.isArray(event.payload.participantAgentIds)) {
    updated.participantAgentIds = event.payload.participantAgentIds as string[];
  }

  state.tasks[taskId] = updated;
  return 'applied';
}

export function reduceTaskStatusChanged(state: ProjectedState, event: Event): ReductionResult {
  const taskId =
    event.entityId ||
    (typeof event.payload.taskId === 'string' ? event.payload.taskId : undefined) ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    '';

  if (!taskId) return 'invalid';

  const existing = state.tasks[taskId];
  if (!existing) {
    // Id-alvo presente, mas entidade ainda não criada: evento órfão
    return 'orphan';
  }

  const rawStatus = event.payload.currentStatus || event.payload.status;
  let statusToApply = existing.status;

  if (rawStatus !== undefined) {
    const parsed = TaskStatusSchema.safeParse(rawStatus);
    if (parsed.success) {
      statusToApply = parsed.data;
    } else {
      state.invalidPayloadCount++;
    }
  }

  const updated: Task = {
    ...existing,
    status: statusToApply,
    updatedAt: typeof event.payload.updatedAt === 'string' ? event.payload.updatedAt : event.occurredAt,
  };

  if (typeof event.payload.startedAt === 'string') {
    updated.startedAt = event.payload.startedAt;
  }
  if (typeof event.payload.completedAt === 'string') {
    updated.completedAt = event.payload.completedAt;
  }

  state.tasks[taskId] = updated;
  return 'applied';
}

export function reduceTaskCompleted(state: ProjectedState, event: Event): ReductionResult {
  const taskId =
    event.entityId ||
    (typeof event.payload.taskId === 'string' ? event.payload.taskId : undefined) ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    '';

  if (!taskId) return 'invalid';

  const existing = state.tasks[taskId];
  if (!existing) {
    // Id-alvo presente, mas entidade ainda não criada: evento órfão
    return 'orphan';
  }

  state.tasks[taskId] = {
    ...existing,
    status: 'done',
    completedAt: typeof event.payload.completedAt === 'string' ? event.payload.completedAt : event.occurredAt,
    updatedAt: typeof event.payload.updatedAt === 'string' ? event.payload.updatedAt : event.occurredAt,
  };
  return 'applied';
}

export function reduceActivityStarted(state: ProjectedState, event: Event): ReductionResult {
  const activityId =
    event.entityId ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    (typeof event.payload.activityId === 'string' ? event.payload.activityId : undefined) ||
    '';

  if (!activityId) return 'invalid';

  const agentId =
    typeof event.payload.agentId === 'string'
      ? event.payload.agentId
      : event.actorId || '';

  const activity: Activity = {
    id: activityId,
    agentId,
    type:
      typeof event.payload.type === 'string'
        ? event.payload.type
        : typeof event.payload.activityType === 'string'
        ? event.payload.activityType
        : 'generic',
    startedAt: typeof event.payload.startedAt === 'string' ? event.payload.startedAt : event.occurredAt,
    endedAt: typeof event.payload.endedAt === 'string' ? event.payload.endedAt : undefined,
    sourceEventId: typeof event.payload.sourceEventId === 'string' ? event.payload.sourceEventId : event.eventId,
  };

  state.activities[activityId] = activity;

  if (agentId && state.agents[agentId]) {
    state.agents[agentId] = {
      ...state.agents[agentId],
      lastActivityAt: event.occurredAt,
    };
  }
  return 'applied';
}

export function reduceActivityFinished(state: ProjectedState, event: Event): ReductionResult {
  const activityId =
    event.entityId ||
    (typeof event.payload.id === 'string' ? event.payload.id : undefined) ||
    (typeof event.payload.activityId === 'string' ? event.payload.activityId : undefined) ||
    '';

  if (!activityId) return 'invalid';

  const existing = state.activities[activityId];
  if (!existing) {
    // Id-alvo presente, mas atividade ainda não iniciada/criada: evento órfão
    return 'orphan';
  }

  state.activities[activityId] = {
    ...existing,
    endedAt: typeof event.payload.endedAt === 'string' ? event.payload.endedAt : event.occurredAt,
  };

  if (existing.agentId && state.agents[existing.agentId]) {
    state.agents[existing.agentId] = {
      ...state.agents[existing.agentId],
      lastActivityAt: event.occurredAt,
    };
  }
  return 'applied';
}

export function reduceConnectionStatusChanged(state: ProjectedState, event: Event): ReductionResult {
  if ('status' in event.payload) {
    const parsed = ConnectionStatusSchema.safeParse(event.payload.status);
    if (parsed.success) {
      state.connectionStatus = parsed.data;
      return 'applied';
    } else {
      state.invalidPayloadCount++;
      return 'applied'; // Evento processado, payload inválido registrado sem crash
    }
  }
  return 'applied';
}

/**
 * Roteia o evento para o reducer específico baseado em event.type.
 * Retorna:
 * - 'applied': Aplicado com sucesso no estado;
 * - 'orphan': Id-alvo presente, mas entidade alvo ainda não existe;
 * - 'invalid': Sem id-alvo extraível ou payload estruturalmente irrecuperável.
 * Eventos desconhecidos não quebram a projeção, incrementam ignoredEventsCount e retornam 'applied'.
 */
export function routeEventReducer(state: ProjectedState, event: Event): ReductionResult {
  switch (event.type) {
    case 'agent.connected':
      return reduceAgentConnected(state, event);
    case 'agent.disconnected':
      return reduceAgentDisconnected(state, event);
    case 'agent.status_changed':
      return reduceAgentStatusChanged(state, event);
    case 'task.created':
      return reduceTaskCreated(state, event);
    case 'task.assigned':
      return reduceTaskAssigned(state, event);
    case 'task.status_changed':
      return reduceTaskStatusChanged(state, event);
    case 'task.completed':
      return reduceTaskCompleted(state, event);
    case 'activity.started':
      return reduceActivityStarted(state, event);
    case 'activity.finished':
      return reduceActivityFinished(state, event);
    case 'connection.status_changed':
      return reduceConnectionStatusChanged(state, event);
    default:
      // Evento desconhecido ou customizado: seguro e auditado
      state.ignoredEventsCount++;
      return 'applied';
  }
}
