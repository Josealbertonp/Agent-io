import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { useProjectedStore } from '../domain';
import { startStoreFeeder, stopStoreFeeder, getActiveFeeder } from './feedProjectedStore';
import { getPresentationEvents, resetEventLog } from './eventLog';
import { resetSelectionStore } from './selectionStore';

describe('feedProjectedStore (fake)', () => {
  beforeEach(() => {
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
    stopStoreFeeder();
  });

  afterEach(() => {
    stopStoreFeeder();
    useProjectedStore.getState().reset();
    resetEventLog();
    resetSelectionStore();
  });

  it('modo fake ingere agentes do demo na store projetada', () => {
    startStoreFeeder({ mode: 'fake', sseUrl: '' });
    const agents = useProjectedStore.getState().agents;
    expect(Object.keys(agents).length).toBeGreaterThanOrEqual(4);
    expect(agents['agent-dev']?.status).toBe('working');
    expect(agents['agent-ghost']?.status).toBe('offline');
  });

  it('simular status muda o Agent na store (fonte única)', () => {
    startStoreFeeder({ mode: 'fake', sseUrl: '' });
    const before = useProjectedStore.getState().agents['agent-dev'].status;
    getActiveFeeder()?.simulateStatusChange('agent-dev');
    const after = useProjectedStore.getState().agents['agent-dev'].status;
    expect(after).not.toBe(before);
  });

  it('simular remoção emite disconnected e marca offline (projeção atual)', () => {
    startStoreFeeder({ mode: 'fake', sseUrl: '' });
    expect(useProjectedStore.getState().agents['agent-qa']).toBeDefined();
    getActiveFeeder()?.simulateRemoveAgent('agent-qa');
    expect(useProjectedStore.getState().agents['agent-qa']?.status).toBe('offline');
  });

  it('ingestão também anexa no eventLog de apresentação', () => {
    startStoreFeeder({ mode: 'fake', sseUrl: '' });
    expect(getPresentationEvents().length).toBeGreaterThan(0);
    expect(getPresentationEvents().some((e) => e.type === 'agent.connected')).toBe(true);
  });
});
