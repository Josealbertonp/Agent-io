import { Event } from '../contracts';
import { ProjectedState, MAX_PENDING_ORPHAN_EVENTS } from './types';
import { orderEvents, safeGetTime } from './ordering';
import { routeEventReducer } from './reducers';

/**
 * Cria o estado inicial vazio para a projeção de eventos.
 */
export function createInitialState(): ProjectedState {
  return {
    agents: {},
    tasks: {},
    activities: {},
    connectionStatus: 'disconnected',
    seenEventIds: new Set<string>(),
    pendingOrphanEvents: [],
    lastSequence: undefined,
    lastOccurredAt: undefined,
    ignoredEventsCount: 0,
    rejectedEventsCount: 0,
    invalidPayloadCount: 0,
    droppedOrphanEventsCount: 0,
  };
}

/**
 * Atualiza lastSequence e lastOccurredAt mantendo o valor máximo monotônico (sem regredir).
 */
function updateMonotonicCursors(state: ProjectedState, event: Event): void {
  // Atualização monotônica de lastSequence
  if (event.sequence !== undefined) {
    if (state.lastSequence === undefined || event.sequence > state.lastSequence) {
      state.lastSequence = event.sequence;
    }
  }

  // Atualização monotônica de lastOccurredAt
  const eventTime = safeGetTime(event.occurredAt);
  if (eventTime !== null) {
    const lastTime = safeGetTime(state.lastOccurredAt);
    if (lastTime === null || eventTime > lastTime) {
      state.lastOccurredAt = event.occurredAt;
    }
  } else if (!state.lastOccurredAt && event.occurredAt) {
    state.lastOccurredAt = event.occurredAt;
  }
}

/**
 * Adiciona um evento órfão ao buffer respeitando o teto MAX_PENDING_ORPHAN_EVENTS (FIFO).
 */
function enqueueOrphan(state: ProjectedState, event: Event): void {
  const alreadyInOrphans = state.pendingOrphanEvents.some((e) => e.eventId === event.eventId);
  if (!alreadyInOrphans) {
    if (state.pendingOrphanEvents.length >= MAX_PENDING_ORPHAN_EVENTS) {
      // Descarta o órfão mais antigo (FIFO)
      state.pendingOrphanEvents.shift();
      state.droppedOrphanEventsCount++;
    }
    state.pendingOrphanEvents.push(event);
  }
}

/**
 * Drena o buffer de eventos órfãos pendentes tentando reaplicá-los em ordem estável.
 */
function drainPendingOrphans(state: ProjectedState): void {
  if (state.pendingOrphanEvents.length === 0) return;

  let progress = true;
  while (progress && state.pendingOrphanEvents.length > 0) {
    progress = false;
    const remaining: Event[] = [];
    const orderedOrphans = orderEvents(state.pendingOrphanEvents);

    for (const orphan of orderedOrphans) {
      const result = routeEventReducer(state, orphan);
      if (result === 'applied') {
        state.seenEventIds.add(orphan.eventId);
        updateMonotonicCursors(state, orphan);
        progress = true;
      } else if (result === 'orphan') {
        remaining.push(orphan);
      } else {
        // 'invalid': irrecuperável -> descarta e contabiliza sem poluir
        state.rejectedEventsCount++;
      }
    }

    state.pendingOrphanEvents = remaining;
  }
}

/**
 * Aplica um único evento sobre o estado projetado de forma pura e imutável.
 * 
 * Estratégia de Idempotência, Órfãos e Rejeição:
 * 1. Normalização de version: ausente/null/undefined é tratado como 1 (default do contrato).
 *    Se presente e !== 1, rejeita imediatamente incrementando `rejectedEventsCount`.
 * 2. Idempotência: Se `seenEventIds` já contém `eventId`, o evento é ignorado sem efeitos colaterais.
 * 3. Roteamento de Reducers:
 *    - 'applied': Marca em `seenEventIds`, atualiza cursores monotônicos e drena órfãos.
 *    - 'orphan': Id-alvo existe mas entidade não -> enfileira em `pendingOrphanEvents` com teto FIFO.
 *    - 'invalid': Sem id-alvo ou estruturalmente impossível -> incrementa `rejectedEventsCount`, não enfileira.
 */
export function projectEvent(state: ProjectedState, event: Event): ProjectedState {
  // Normalização e validação de version: default é 1; rejeita apenas quando PRESENTE e !== 1
  const effectiveVersion = (event.version === undefined || event.version === null) ? 1 : event.version;
  if (effectiveVersion !== 1) {
    return {
      ...state,
      agents: { ...state.agents },
      tasks: { ...state.tasks },
      activities: { ...state.activities },
      seenEventIds: new Set(state.seenEventIds),
      pendingOrphanEvents: [...state.pendingOrphanEvents],
      rejectedEventsCount: state.rejectedEventsCount + 1,
    };
  }

  // Idempotência estrita
  if (state.seenEventIds.has(event.eventId)) {
    return state;
  }

  const nextState: ProjectedState = {
    agents: { ...state.agents },
    tasks: { ...state.tasks },
    activities: { ...state.activities },
    connectionStatus: state.connectionStatus,
    seenEventIds: new Set(state.seenEventIds),
    pendingOrphanEvents: [...state.pendingOrphanEvents],
    lastSequence: state.lastSequence,
    lastOccurredAt: state.lastOccurredAt,
    ignoredEventsCount: state.ignoredEventsCount,
    rejectedEventsCount: state.rejectedEventsCount,
    invalidPayloadCount: state.invalidPayloadCount,
    droppedOrphanEventsCount: state.droppedOrphanEventsCount,
  };

  const result = routeEventReducer(nextState, event);

  if (result === 'applied') {
    nextState.seenEventIds.add(event.eventId);
    updateMonotonicCursors(nextState, event);

    // Se houver órfãos pendentes, tenta drená-los agora
    drainPendingOrphans(nextState);
  } else if (result === 'orphan') {
    // Evento órfão legítimo: enfileira no buffer respeitando teto FIFO
    enqueueOrphan(nextState, event);
  } else {
    // Evento inválido / irrecuperável (ex: sem id-alvo): rejeita sem poluir órfãos
    nextState.rejectedEventsCount++;
  }

  return nextState;
}

/**
 * Aplica uma lista de eventos sobre o estado, ordenando-os deterministicamente
 * antes do processamento e garantindo idempotência e tolerância a eventos fora de ordem.
 */
export function applyEvents(state: ProjectedState, events: readonly Event[]): ProjectedState {
  const ordered = orderEvents(events);
  let current = state;

  for (const event of ordered) {
    current = projectEvent(current, event);
  }

  return current;
}
