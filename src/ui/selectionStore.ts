import { create } from 'zustand';
import { Event } from '../contracts';

/**
 * UI-state de seleção. Guarda SOMENTE o id.
 * Os dados do agente vêm sempre do ProjectedState — sem cópia canônica aqui.
 */
export type SelectionClearReason = 'removed' | 'disconnected' | 'manual';

export interface SelectionNotice {
  reason: 'removed' | 'disconnected';
  agentId: string;
}

export interface SelectionState {
  selectedAgentId: string | null;
  notice: SelectionNotice | null;
  select: (id: string) => void;
  clear: (reason?: SelectionClearReason) => void;
  dismissNotice: () => void;
  /** Invalida se o id saiu do Record projetado. */
  syncWithAgents: (agents: Record<string, unknown>) => void;
  /** Limpa se o selecionado acabou de desconectar. */
  handleEvents: (events: readonly Event[]) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedAgentId: null,
  notice: null,

  select: (id: string) => {
    set({ selectedAgentId: id, notice: null });
  },

  clear: (reason: SelectionClearReason = 'manual') => {
    const previous = get().selectedAgentId;
    if (reason === 'removed' || reason === 'disconnected') {
      set({
        selectedAgentId: null,
        notice: previous ? { reason, agentId: previous } : get().notice,
      });
      return;
    }
    set({ selectedAgentId: null });
  },

  dismissNotice: () => {
    set({ notice: null });
  },

  syncWithAgents: (agents: Record<string, unknown>) => {
    const selected = get().selectedAgentId;
    if (selected && !(selected in agents)) {
      get().clear('removed');
    }
  },

  handleEvents: (events: readonly Event[]) => {
    const selected = get().selectedAgentId;
    if (!selected) return;
    const left = events.some((event) => {
      if (event.type !== 'agent.disconnected') return false;
      return event.entityId === selected || event.actorId === selected;
    });
    if (left) {
      get().clear('disconnected');
    }
  },
}));

export function resetSelectionStore(): void {
  useSelectionStore.setState({ selectedAgentId: null, notice: null });
}
