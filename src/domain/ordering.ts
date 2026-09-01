import { Event } from '../contracts';

/**
 * Converte com segurança uma string ISO de data para timestamp numérico.
 * Se inválido, retorna null para tratamento determinístico sem gerar NaN.
 */
export function safeGetTime(isoString?: string): number | null {
  if (!isoString) return null;
  const t = new Date(isoString).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Compara dois eventos para ordenação determinística e estável:
 * 1. Pelo campo `sequence` quando presente em ambos;
 * 2. Por `occurredAt` (timestamp ISO 8601 numérico válido).
 *    Eventos com occurredAt inválido são empurrados deterministicamente para o fim;
 * 3. Desempate estável por `eventId` (ordem determinística via operadores `<` e `>`).
 */
export function compareEvents(a: Event, b: Event): number {
  if (a.sequence !== undefined && b.sequence !== undefined) {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
  }

  const timeA = safeGetTime(a.occurredAt);
  const timeB = safeGetTime(b.occurredAt);

  if (timeA !== null && timeB !== null) {
    if (timeA !== timeB) {
      return timeA - timeB;
    }
  } else if (timeA !== null && timeB === null) {
    return -1;
  } else if (timeA === null && timeB !== null) {
    return 1;
  }

  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

/**
 * Retorna uma nova lista de eventos ordenada deterministicamente.
 */
export function orderEvents(events: readonly Event[]): Event[] {
  return [...events].sort(compareEvents);
}

/**
 * Remove eventos duplicados dentro do lote e eventos já processados anteriormente.
 * Nota de Arquitetura: Esta função auxilia no pré-processamento de lotes e pipelines de ingestão,
 * enquanto `projectEvent` atua como a garantia central definitiva de idempotência (seenEventIds).
 */
export function deduplicateEvents(
  events: readonly Event[],
  seenIds?: ReadonlySet<string>
): Event[] {
  const localSeen = new Set<string>();
  const result: Event[] = [];

  for (const event of events) {
    if (seenIds && seenIds.has(event.eventId)) {
      continue;
    }
    if (localSeen.has(event.eventId)) {
      continue;
    }
    localSeen.add(event.eventId);
    result.push(event);
  }

  return result;
}
