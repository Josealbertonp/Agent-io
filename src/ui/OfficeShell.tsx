import { useEffect, useState } from 'react';
import { useProjectedStore } from '../domain';
import { AgentList } from './AgentList';
import { AgentPanel } from './AgentPanel';
import { ConnectionBanner } from './ConnectionBanner';
import { EventTimeline } from './EventTimeline';
import { usePresentationEventLog } from './eventLog';
import { OfficeCanvas } from './OfficeCanvas';
import { useSelectionStore } from './selectionStore';
import { StatusFilter } from './StatusFilter';
import { StatusFilterValue } from './filterAgents';

/**
 * Shell operacional da interface operacional. Phaser só na OfficeCanvas.
 * ProjectedState = fonte de verdade; selectionStore = só o id.
 */
export function OfficeShell() {
  const agents = useProjectedStore((s) => s.agents);
  const connectionStatus = useProjectedStore((s) => s.connectionStatus);
  const events = usePresentationEventLog();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [listOpen, setListOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const selectedAgentId = useSelectionStore((s) => s.selectedAgentId);

  useEffect(() => {
    const unsub = useProjectedStore.subscribe((state) => {
      useSelectionStore.getState().syncWithAgents(state.agents);
    });
    useSelectionStore.getState().syncWithAgents(useProjectedStore.getState().agents);
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedAgentId) setPanelOpen(true);
  }, [selectedAgentId]);

  return (
    <div className="office-shell">
      <ConnectionBanner connectionStatus={connectionStatus} />
      <div className="office-toolbar">
        <button type="button" className="office-toolbar__btn" onClick={() => setListOpen((v) => !v)}>
          Lista
        </button>
        <button type="button" className="office-toolbar__btn" onClick={() => setPanelOpen((v) => !v)}>
          Detalhe
        </button>
      </div>
      <aside
        className={listOpen ? 'office-rail office-rail--list is-open' : 'office-rail office-rail--list'}
      >
        <h2 className="office-rail__title">Agentes</h2>
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <AgentList agents={agents} statusFilter={statusFilter} />
      </aside>
      <section className="office-stage">
        <OfficeCanvas />
      </section>
      <aside
        className={
          panelOpen ? 'office-rail office-rail--panel is-open' : 'office-rail office-rail--panel'
        }
      >
        <AgentPanel agents={agents} connectionStatus={connectionStatus} events={events} />
      </aside>
      <EventTimeline events={events} agents={agents} statusFilter={statusFilter} />
    </div>
  );
}
