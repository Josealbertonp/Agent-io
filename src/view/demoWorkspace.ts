import { AgentStatus } from '../contracts';
import { NormalizedAgentState, WorkspaceSnapshot } from '../adapter';

const WORKSPACE_ID = 'maestri-local';

function agent(partial: {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  provider: string;
  model: string;
  x: number;
  y: number;
  currentActivity?: string;
}): NormalizedAgentState {
  return {
    id: partial.id,
    workspaceId: WORKSPACE_ID,
    name: partial.name,
    provider: partial.provider,
    model: partial.model,
    providerKnown: true,
    role: partial.role,
    status: partial.status,
    statusConfidence: 'high',
    statusEvidence: 'office-demo',
    currentActivity: partial.currentActivity,
    position: { x: partial.x, y: partial.y },
  };
}

/** Snapshot local rico para o escritório (não exige bridge/Maestri). */
export function createOfficeDemoSnapshot(hash: string = 'office-demo-v1'): WorkspaceSnapshot {
  return {
    workspaceId: WORKSPACE_ID,
    timestamp: new Date().toISOString(),
    connectionStatus: 'connected',
    rawHash: hash,
    agents: {
      'agent-dev': agent({
        id: 'agent-dev',
        name: 'Developer',
        role: 'Implementador',
        status: 'working',
        provider: 'cursor',
        model: 'grok-4.6',
        x: 5,
        y: 6,
        currentActivity: 'implementando a etapa 4',
      }),
      'agent-planner': agent({
        id: 'agent-planner',
        name: 'Planner',
        role: 'Arquiteto',
        status: 'planning',
        provider: 'anthropic',
        model: 'claude-sonnet',
        x: 14,
        y: 6,
        currentActivity: 'desenhando o plano',
      }),
      'agent-reviewer': agent({
        id: 'agent-reviewer',
        name: 'Reviewer',
        role: 'Revisor',
        status: 'idle',
        provider: 'openai',
        model: 'gpt-4o',
        x: 23,
        y: 6,
      }),
      'agent-qa': agent({
        id: 'agent-qa',
        name: 'QA',
        role: 'Qualidade',
        status: 'waiting',
        provider: 'unknown',
        model: 'unknown',
        x: 5,
        y: 12,
      }),
      'agent-ops': agent({
        id: 'agent-ops',
        name: 'Ops',
        role: 'SRE',
        status: 'blocked',
        provider: 'google',
        model: 'gemini',
        x: 14,
        y: 12,
      }),
      'agent-ghost': agent({
        id: 'agent-ghost',
        name: 'Legacy',
        role: 'Arquivado',
        status: 'offline',
        provider: 'unknown',
        model: 'unknown',
        x: 23,
        y: 12,
      }),
    },
  };
}

const DEMO_CYCLE: AgentStatus[] = [
  'idle',
  'planning',
  'working',
  'waiting',
  'reviewing',
  'done',
  'blocked',
  'error',
  'offline',
];

const ACTIVITY_BY_STATUS: Partial<Record<AgentStatus, string>> = {
  working: 'implementando',
  planning: 'planejando mudança',
  reviewing: 'revisando código',
  waiting: 'aguardando resposta',
  blocked: 'bloqueado em dependência',
  error: 'falha na execução',
};

export function cycleDemoAgentStatus(
  snapshot: WorkspaceSnapshot,
  agentId: string = 'agent-dev'
): WorkspaceSnapshot {
  const current = snapshot.agents[agentId];
  if (!current) return snapshot;

  const index = DEMO_CYCLE.indexOf(current.status);
  const nextStatus = DEMO_CYCLE[(index + 1) % DEMO_CYCLE.length];
  const nextHash = `office-demo-${Date.now()}`;

  return {
    ...snapshot,
    timestamp: new Date().toISOString(),
    rawHash: nextHash,
    agents: {
      ...snapshot.agents,
      [agentId]: {
        ...current,
        status: nextStatus,
        currentActivity: ACTIVITY_BY_STATUS[nextStatus],
      },
    },
  };
}

export function demoSnapshotWithActivity(
  snapshot: WorkspaceSnapshot,
  agentId: string,
  activity: string
): WorkspaceSnapshot {
  const current = snapshot.agents[agentId];
  if (!current) return snapshot;
  return {
    ...snapshot,
    timestamp: new Date().toISOString(),
    rawHash: `office-demo-act-${Date.now()}`,
    agents: {
      ...snapshot.agents,
      [agentId]: { ...current, currentActivity: activity },
    },
  };
}

export function demoSnapshotWithoutAgent(
  snapshot: WorkspaceSnapshot,
  agentId: string
): WorkspaceSnapshot {
  const agents = { ...snapshot.agents };
  delete agents[agentId];
  return {
    ...snapshot,
    timestamp: new Date().toISOString(),
    rawHash: `office-demo-rm-${Date.now()}`,
    agents,
  };
}
