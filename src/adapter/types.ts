import { AgentStatus, ConnectionStatus } from '../contracts';

/**
 * Confiança da inferência de status a partir do buffer do terminal.
 * Status diferente de idle derivado de heurística é no máximo "medium".
 */
export type StatusConfidence = 'low' | 'medium' | 'high';

/**
 * Representação crua de um agente retornada pela inspeção do Maestri.
 */
export interface MaestriRawAgent {
  name: string;
  /** Role parseado da CLI (`role: "..."`). Ausente se a CLI não trouxe o campo. */
  role?: string;
  isSelf?: boolean;
  terminalOutputSample?: string;
  lastCheckedAt?: string;
}

/**
 * Representação crua de uma nota no canvas do Maestri.
 */
export interface MaestriRawNote {
  name: string;
  stack?: string;
}

/**
 * Representação crua de um portal (Browser / Android) no Maestri.
 */
export interface MaestriRawPortal {
  name: string;
  type?: 'browser' | 'device';
  urlOrTarget?: string;
}

/**
 * Snapshot bruto extraído do Maestri via CLI de leitura.
 */
export interface MaestriRawWorkspace {
  workspaceId: string;
  capturedAt: string;
  selfName?: string;
  /** Role do self se a CLI trouxe `role:` na seção You. */
  selfRole?: string;
  connectedAgents: MaestriRawAgent[];
  notes: MaestriRawNote[];
  portals: MaestriRawPortal[];
  isAvailable: boolean;
  rawOutput?: string;
}

/**
 * Entidade normalizada de Agente no adaptador antes da emissão do evento.
 *
 * provider/model: a CLI Maestri NÃO informa estes campos. Sempre `"unknown"`
 * com `providerKnown: false`. Não inventar "maestri" / "cursor-agent".
 */
export interface NormalizedAgentState {
  id: string;
  workspaceId: string;
  name: string;
  provider: string;
  model: string;
  /** Sempre false para fonte Maestri CLI — provider/model não vêm da CLI. */
  providerKnown: boolean;
  role: string;
  status: AgentStatus;
  statusConfidence: StatusConfidence;
  /** Trecho curto da evidência usada na inferência (ou marcador de default). */
  statusEvidence: string;
  currentTaskId?: string;
  currentActivity?: string;
  lastActivityAt?: string;
  position: { x: number; y: number };
}

/**
 * Snapshot estruturado e normalizado do workspace.
 */
export interface WorkspaceSnapshot {
  workspaceId: string;
  timestamp: string;
  connectionStatus: ConnectionStatus;
  agents: Record<string, NormalizedAgentState>;
  rawHash: string;
}

/**
 * Contrato de fonte de dados do workspace (desacoplado de CLI, HTTP ou mocks).
 */
export interface WorkspaceSource {
  getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
  ping?(): Promise<boolean>;
}

/**
 * Checkpoint persistido em `.agent-io/` para resume sem reemitir o mesmo estado.
 *
 * version 2: inclui `lastSnapshot` (prev do differ) e `emittedEventIds` com teto FIFO.
 */
export interface AdapterCheckpoint {
  version: number;
  lastSequence: number;
  lastOccurredAt?: string;
  lastSnapshotHash?: string;
  /** Último snapshot normalizado — restaurado como `prev` após restart. */
  lastSnapshot?: WorkspaceSnapshot;
  /** IDs já emitidos pela ponte, persistidos com teto FIFO. */
  emittedEventIds: string[];
  updatedAt: string;
}
