import { useEffect, useState } from 'react';
import { useProjectedStore } from './domain';
import { OfficeShell } from './ui/OfficeShell';
import { getActiveFeeder, startStoreFeeder, stopStoreFeeder } from './ui/feedProjectedStore';
import { getFeedConfig } from './ui/feedConfig';
import { resetEventLog } from './ui/eventLog';
import { resetSelectionStore } from './ui/selectionStore';
import './App.css';

export function App() {
  const connectionStatus = useProjectedStore((s) => s.connectionStatus);
  const agentCount = useProjectedStore((s) => Object.keys(s.agents).length);
  const [feedMode] = useState(() => getFeedConfig().mode);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      startStoreFeeder();
    });
    return () => {
      cancelled = true;
      stopStoreFeeder();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = {
      reset: () => {
        useProjectedStore.getState().reset();
        resetEventLog();
        resetSelectionStore();
      },
      simulateStatus: () => getActiveFeeder()?.simulateStatusChange('agent-dev'),
      simulateRemove: (id: string) => getActiveFeeder()?.simulateRemoveAgent(id),
    };
    (window as Window & { __agentIo?: typeof api }).__agentIo = api;
    return () => {
      delete (window as Window & { __agentIo?: typeof api }).__agentIo;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <strong>Agent-IO</strong>
          <span className="app-meta">
            {feedMode} · {connectionStatus} · {agentCount} agentes
          </span>
        </div>
        <div className="app-actions">
          {feedMode === 'fake' ? (
            <button
              type="button"
              onClick={() => getActiveFeeder()?.simulateStatusChange('agent-dev')}
            >
              Simular status
            </button>
          ) : null}
        </div>
      </header>
      <main className="app-main">
        <OfficeShell />
      </main>
      <footer className="app-credit">
        Tiles: Modern Office by LimeZu — créditos apreciados. Agentes: placeholder (pacote sem
        sprites de personagem).
      </footer>
    </div>
  );
}

export default App;
