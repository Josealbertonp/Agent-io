/**
 * Rótulos de apresentação. Não alteram o valor canônico no ProjectedState.
 * "unknown" do contrato/adapter é exibido como "desconhecido" — nunca escondido.
 */

export function displayProviderOrModel(value: string | undefined | null): string {
  if (value == null || value === '') return 'sem dado';
  if (value === 'unknown') return 'desconhecido';
  return value;
}

export function displayOptional(value: string | undefined | null): string {
  if (value == null || value === '') return 'sem dado';
  return value;
}

export function formatOccurredAt(iso: string | undefined | null): string {
  if (!iso) return 'sem dado';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR');
}
