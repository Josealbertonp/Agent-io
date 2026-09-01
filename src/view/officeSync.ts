import { AgentView } from './agentViewModel';

/**
 * Porta da cena para sincronizar entidades visuais.
 * Phaser implementa; testes usam um host em memória.
 * A cena NÃO guarda estado canônico — só espelha o view-model.
 */
export interface AgentEntityHost {
  upsertAgent(view: AgentView): void;
  removeAgent(id: string): void;
  getAgentIds(): string[];
}

export interface SyncResult {
  upserted: string[];
  removed: string[];
}

export function syncAgentViews(host: AgentEntityHost, views: readonly AgentView[]): SyncResult {
  const incoming = new Set(views.map((view) => view.id));
  const removed: string[] = [];

  for (const id of host.getAgentIds()) {
    if (!incoming.has(id)) {
      host.removeAgent(id);
      removed.push(id);
    }
  }

  const upserted: string[] = [];
  for (const view of views) {
    host.upsertAgent(view);
    upserted.push(view.id);
  }

  return { upserted, removed };
}

export function createMemoryHost(): AgentEntityHost & { entities: Map<string, AgentView> } {
  const entities = new Map<string, AgentView>();
  return {
    entities,
    upsertAgent(view) {
      entities.set(view.id, view);
    },
    removeAgent(id) {
      entities.delete(id);
    },
    getAgentIds() {
      return [...entities.keys()];
    },
  };
}
