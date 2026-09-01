import { AgentStatus } from '../contracts';
import {
  MaestriRawAgent,
  MaestriRawWorkspace,
  NormalizedAgentState,
  StatusConfidence,
  WorkspaceSnapshot,
} from './types';

const AGENT_LINE_RE = /^-\s*name:\s*"([^"]+)"(?:\s*,\s*role:\s*"([^"]+)")?/;

const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷]/;

/** Marcadores fortes de execução do próprio agente — não palavras genéricas do buffer. */
const STRONG_WORKING_RES = [
  SPINNER_RE,
  /\bexecuting\s+tool\b/i,
  /\btool\s+call(?:ing)?\b/i,
  /\brunning\s+(?:command|tool)\b/i,
  /\bagent\s+is\s+(?:running|working|executing)\b/i,
  /\bstatus:\s*working\b/i,
];

const STRONG_ERROR_RES = [
  /\bstatus:\s*error\b/i,
  /\bprocess\s+exited\s+with\s+code\s+[1-9]\d*\b/i,
  /\bagent\s+(?:crashed|terminated\s+abnormally)\b/i,
];

const EVIDENCE_MAX = 80;
const UNKNOWN_PROVIDER = 'unknown';
const UNKNOWN_MODEL = 'unknown';
const FALLBACK_ROLE = 'Agent';

/**
 * Faz o parse da saída textual do comando `maestri list`.
 * Aceita `- name: "X"` e `- name: "X", role: "Y"` na mesma linha.
 */
export function parseMaestriListOutput(
  stdout: string,
  workspaceId: string = 'maestri-default'
): MaestriRawWorkspace {
  const lines = stdout.split(/\r?\n/);
  let currentSection: 'you' | 'agents' | 'notes' | 'portals' | null = null;
  let selfName: string | undefined;
  let selfRole: string | undefined;
  const connectedAgents: MaestriRawAgent[] = [];
  const notes: MaestriRawWorkspace['notes'] = [];
  const portals: MaestriRawWorkspace['portals'] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('You:')) {
      currentSection = 'you';
      continue;
    }
    if (trimmed.startsWith('Connected agents:')) {
      currentSection = 'agents';
      continue;
    }
    if (trimmed.startsWith('Notes:') || trimmed.startsWith('Connected notes:')) {
      currentSection = 'notes';
      continue;
    }
    if (trimmed.startsWith('Portals:') || trimmed.startsWith('Connected portals:')) {
      currentSection = 'portals';
      continue;
    }

    const nameMatch = trimmed.match(AGENT_LINE_RE);
    if (nameMatch) {
      const name = nameMatch[1];
      const role = nameMatch[2];
      if (currentSection === 'you') {
        selfName = name;
        selfRole = role;
      } else if (currentSection === 'agents') {
        connectedAgents.push({ name, role, isSelf: false });
      } else if (currentSection === 'notes') {
        notes.push({ name });
      } else if (currentSection === 'portals') {
        portals.push({ name });
      }
    }
  }

  return {
    workspaceId,
    capturedAt: new Date().toISOString(),
    selfName,
    selfRole,
    connectedAgents,
    notes,
    portals,
    isAvailable: true,
    rawOutput: stdout,
  };
}

export interface InferredAgentStatus {
  status: AgentStatus;
  activity?: string;
  statusConfidence: StatusConfidence;
  statusEvidence: string;
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 16);
  const end = Math.min(text.length, index + length + 16);
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_MAX);
}

function firstMatch(text: string, patterns: RegExp[]): { index: number; length: number } | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      return { index: match.index, length: match[0].length };
    }
  }
  return null;
}

/**
 * Infere status de forma conservadora. Default = idle sem sinal FORTE.
 * Palavras genéricas ("review", "error", "implement") no buffer NÃO alteram o status.
 * Status != idle só com spinner / indicador explícito de execução do próprio agente.
 * Heurística != idle tem confiança no máximo "medium".
 */
export function inferAgentStatus(terminalOutput?: string): InferredAgentStatus {
  if (!terminalOutput || !terminalOutput.trim()) {
    return {
      status: 'idle',
      statusConfidence: 'high',
      statusEvidence: 'empty-output',
    };
  }

  const errorHit = firstMatch(terminalOutput, STRONG_ERROR_RES);
  if (errorHit) {
    return {
      status: 'error',
      activity: 'error_occurred',
      statusConfidence: 'medium',
      statusEvidence: snippetAround(terminalOutput, errorHit.index, errorHit.length),
    };
  }

  const workingHit = firstMatch(terminalOutput, STRONG_WORKING_RES);
  if (workingHit) {
    return {
      status: 'working',
      activity: 'executing',
      statusConfidence: 'medium',
      statusEvidence: snippetAround(terminalOutput, workingHit.index, workingHit.length),
    };
  }

  return {
    status: 'idle',
    statusConfidence: 'low',
    statusEvidence: 'no-strong-signal',
  };
}

/**
 * Cria um hash determinístico simples em string a partir de um objeto serializado.
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export interface StableHashInput {
  connectionStatus: string;
  agents: Record<string, Pick<NormalizedAgentState, 'id' | 'name' | 'role' | 'status' | 'currentActivity'>>;
}

/**
 * Hash estável do snapshot normalizado: agentes ordenados por id
 * `{agentId, name, role, status, currentActivity}` + connectionStatus.
 * Sem capturedAt, sample, timestamps ou evidência de heurística.
 */
export function computeStableSnapshotHash(input: StableHashInput): string {
  const agents = Object.values(input.agents)
    .map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      currentActivity: agent.currentActivity ?? null,
    }))
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  return hashString(JSON.stringify({ connectionStatus: input.connectionStatus, agents }));
}

function toAgentId(name: string): string {
  return `agent-${name.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Normaliza o MaestriRawWorkspace para WorkspaceSnapshot estruturado.
 * Self ("You") entra idle por padrão — NÃO roda inferência sobre o `maestri list` inteiro.
 */
export function normalizeMaestriWorkspace(raw: MaestriRawWorkspace): WorkspaceSnapshot {
  const agents: Record<string, NormalizedAgentState> = {};

  if (raw.selfName) {
    const id = toAgentId(raw.selfName);
    agents[id] = {
      id,
      workspaceId: raw.workspaceId,
      name: raw.selfName,
      provider: UNKNOWN_PROVIDER,
      model: UNKNOWN_MODEL,
      providerKnown: false,
      role: raw.selfRole || FALLBACK_ROLE,
      status: 'idle',
      statusConfidence: 'high',
      statusEvidence: 'self-default-idle',
      lastActivityAt: raw.capturedAt,
      position: { x: 2, y: 2 },
    };
  }

  let idx = 1;
  for (const rawAgent of raw.connectedAgents) {
    const id = toAgentId(rawAgent.name);
    const inferred = inferAgentStatus(rawAgent.terminalOutputSample);

    agents[id] = {
      id,
      workspaceId: raw.workspaceId,
      name: rawAgent.name,
      provider: UNKNOWN_PROVIDER,
      model: UNKNOWN_MODEL,
      providerKnown: false,
      role: rawAgent.role || FALLBACK_ROLE,
      status: inferred.status,
      statusConfidence: inferred.statusConfidence,
      statusEvidence: inferred.statusEvidence,
      currentActivity: inferred.activity,
      lastActivityAt: rawAgent.lastCheckedAt || raw.capturedAt,
      position: { x: 4 + idx * 2, y: 2 + idx * 2 },
    };
    idx++;
  }

  const connectionStatus = raw.isAvailable ? 'connected' : 'error';
  const rawHash = computeStableSnapshotHash({ connectionStatus, agents });

  return {
    workspaceId: raw.workspaceId,
    timestamp: raw.capturedAt,
    connectionStatus,
    agents,
    rawHash,
  };
}
