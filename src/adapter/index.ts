/**
 * Superfície browser-safe do adaptador.
 * NÃO reexporta módulos `*.node.ts` (fs / child_process).
 */
export * from './types';
export * from './parser';
export * from './differ';
export * from './poller';
export * from './checkpoint';
export * from './fakeSource';
