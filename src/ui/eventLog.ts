import { useSyncExternalStore } from 'react';
import { Event } from '../contracts';

/**
 * HISTÓRICO DE APRESENTAÇÃO — NÃO é fonte de verdade de estado de entidade.
 *
 * O ProjectedState (domínio) continua sendo a única fonte canônica de agentes/tarefas.
 * Este ring buffer (FIFO, teto 200) existe só para a timeline e para expor campos
 * de inferência (statusConfidence / statusEvidence / currentActivity) que o
 * contrato Agent não carrega — opção A da Etapa 4: lidos do payload do evento
 * mais recente por agente, sem gravar no Agent canônico.
 */
export const PRESENTATION_EVENT_LOG_CAP = 200;

let events: Event[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function appendPresentationEvents(incoming: readonly Event[]): void {
  if (incoming.length === 0) return;
  events = events.concat(incoming);
  if (events.length > PRESENTATION_EVENT_LOG_CAP) {
    events = events.slice(events.length - PRESENTATION_EVENT_LOG_CAP);
  }
  emit();
}

export function getPresentationEvents(): readonly Event[] {
  return events;
}

export function resetEventLog(): void {
  if (events.length === 0) return;
  events = [];
  emit();
}

export function subscribeEventLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePresentationEventLog(): readonly Event[] {
  return useSyncExternalStore(subscribeEventLog, getPresentationEvents, getPresentationEvents);
}
