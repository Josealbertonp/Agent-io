import { AgentStatus } from '../contracts';

/**
 * Visual de status: cor + ícone + rótulo. Nunca só cor.
 * Fonte de verdade do status continua sendo Agent.status no ProjectedState.
 */
export interface StatusVisual {
  key: AgentStatus;
  color: number;
  hex: string;
  icon: string;
  label: string;
  description: string;
}

const STATUS_VISUAL: Record<AgentStatus, StatusVisual> = {
  idle: {
    key: 'idle',
    color: 0x7cb87c,
    hex: '#7cb87c',
    icon: '○',
    label: 'idle',
    description: 'Ocioso — aguardando trabalho',
  },
  working: {
    key: 'working',
    color: 0x4aa3df,
    hex: '#4aa3df',
    icon: '▶',
    label: 'working',
    description: 'Trabalhando',
  },
  error: {
    key: 'error',
    color: 0xe05555,
    hex: '#e05555',
    icon: '!',
    label: 'error',
    description: 'Erro',
  },
  offline: {
    key: 'offline',
    color: 0x8a8a8a,
    hex: '#8a8a8a',
    icon: '×',
    label: 'offline',
    description: 'Offline / desconectado',
  },
  waiting: {
    key: 'waiting',
    color: 0xe0c040,
    hex: '#e0c040',
    icon: '…',
    label: 'waiting',
    description: 'Aguardando',
  },
  planning: {
    key: 'planning',
    color: 0x9b7ed9,
    hex: '#9b7ed9',
    icon: '▣',
    label: 'planning',
    description: 'Planejando',
  },
  blocked: {
    key: 'blocked',
    color: 0xe07a3a,
    hex: '#e07a3a',
    icon: '#',
    label: 'blocked',
    description: 'Bloqueado',
  },
  reviewing: {
    key: 'reviewing',
    color: 0x5bb8b0,
    hex: '#5bb8b0',
    icon: '◉',
    label: 'reviewing',
    description: 'Revisando',
  },
  done: {
    key: 'done',
    color: 0x5a9e6f,
    hex: '#5a9e6f',
    icon: '✓',
    label: 'done',
    description: 'Concluído',
  },
};

/** Fallback neutro se um status desconhecido aparecer (débito: não deve ocorrer no contrato). */
export const NEUTRAL_STATUS_VISUAL: StatusVisual = {
  key: 'idle',
  color: 0x6b7280,
  hex: '#6b7280',
  icon: '?',
  label: 'unknown',
  description: 'Status sem visual dedicado — fallback neutro',
};

export function statusVisualFor(status: AgentStatus | string): StatusVisual {
  if (status in STATUS_VISUAL) {
    return STATUS_VISUAL[status as AgentStatus];
  }
  return NEUTRAL_STATUS_VISUAL;
}

export function allStatusVisuals(): readonly StatusVisual[] {
  return Object.values(STATUS_VISUAL);
}
