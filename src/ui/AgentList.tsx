import { Agent } from '../contracts';
import { statusVisualFor } from '../view/statusVisual';
import { displayProviderOrModel } from './displayLabels';
import { filterAgentsByStatus, StatusFilterValue } from './filterAgents';
import { useSelectionStore } from './selectionStore';

export interface AgentListProps {
  agents: Record<string, Agent>;
  statusFilter: StatusFilterValue;
}

function sortAgents(agents: readonly Agent[]): Agent[] {
  return [...agents].sort((a, b) => a.name.localeCompare(b.name, 'pt') || a.id.localeCompare(b.id));
}

export function AgentList({ agents, statusFilter }: AgentListProps) {
  const selectedAgentId = useSelectionStore((s) => s.selectedAgentId);
  const select = useSelectionStore((s) => s.select);
  const filtered = filterAgentsByStatus(sortAgents(Object.values(agents)), statusFilter);

  if (Object.keys(agents).length === 0) {
    return (
      <div className="agent-list" data-testid="agent-list">
        <p className="empty-state" data-testid="empty-agents">
          Nenhum agente projetado.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="agent-list" data-testid="agent-list">
        <p className="empty-state" data-testid="empty-filter">
          Nenhum agente com este status.
        </p>
      </div>
    );
  }

  return (
    <ul className="agent-list" data-testid="agent-list">
      {filtered.map((agent) => {
        const visual = statusVisualFor(agent.status);
        const selected = agent.id === selectedAgentId;
        return (
          <li key={agent.id}>
            <button
              type="button"
              className={selected ? 'agent-list__item is-selected' : 'agent-list__item'}
              data-testid={`agent-list-item-${agent.id}`}
              aria-pressed={selected}
              onClick={() => select(agent.id)}
              style={{ borderLeftColor: visual.hex }}
            >
              <span className="agent-list__row">
                <span className="agent-list__name">{agent.name}</span>
                <span className="agent-list__status" style={{ color: visual.hex }}>
                  <span className="status-dot status-dot--sm" style={{ background: visual.hex }} aria-hidden />
                  {visual.label}
                </span>
              </span>
              <span className="agent-list__meta">{agent.role}</span>
              <span className="agent-list__meta">
                {displayProviderOrModel(agent.provider)}/{displayProviderOrModel(agent.model)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
