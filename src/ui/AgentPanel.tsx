import { Agent, ConnectionStatus, Event } from '../contracts';
import { statusVisualFor } from '../view/statusVisual';
import { selectAgentViews } from '../view/agentViewModel';
import { extrasFromEvents } from './agentExtras';
import { displayOptional, displayProviderOrModel, formatOccurredAt } from './displayLabels';
import { useSelectionStore } from './selectionStore';

export interface AgentPanelProps {
  agents: Record<string, Agent>;
  connectionStatus: ConnectionStatus;
  events: readonly Event[];
}

export function AgentPanel({ agents, connectionStatus, events }: AgentPanelProps) {
  const selectedAgentId = useSelectionStore((s) => s.selectedAgentId);
  const notice = useSelectionStore((s) => s.notice);
  const clear = useSelectionStore((s) => s.clear);
  const dismissNotice = useSelectionStore((s) => s.dismissNotice);

  const agent = selectedAgentId ? agents[selectedAgentId] : undefined;

  if (!agent) {
    return (
      <aside className="agent-panel" data-testid="agent-panel">
        {notice ? (
          <p className="selection-notice" data-testid="selection-notice">
            {notice.reason === 'disconnected'
              ? `Agente selecionado foi desconectado (${notice.agentId}).`
              : `Agente selecionado foi removido (${notice.agentId}).`}
            <button type="button" onClick={dismissNotice}>
              Ok
            </button>
          </p>
        ) : (
          <p className="empty-state" data-testid="panel-empty">
            Selecione um agente no escritório ou na lista.
          </p>
        )}
      </aside>
    );
  }

  const view = selectAgentViews(agents).find((item) => item.id === agent.id);
  const extras = extrasFromEvents(agent.id, events);
  const visual = statusVisualFor(agent.status);

  return (
    <aside className="agent-panel" data-testid="agent-panel">
      <header className="agent-panel__head">
        <h2>{agent.name}</h2>
        <button type="button" className="agent-panel__close" onClick={() => clear('manual')}>
          Fechar
        </button>
      </header>
      <dl className="agent-panel__fields">
        <Row label="Role" value={agent.role} />
        <Row label="Provider" value={displayProviderOrModel(agent.provider)} testId="panel-provider" />
        <Row label="Model" value={displayProviderOrModel(agent.model)} testId="panel-model" />
        <div className="agent-panel__row">
          <dt>Status</dt>
          <dd data-testid="panel-status" style={{ color: visual.hex }}>
            <span className="status-dot" style={{ background: visual.hex }} aria-hidden>
              {visual.icon}
            </span>
            {visual.label}
          </dd>
        </div>
        <Row
          label="Atividade"
          value={displayOptional(extras.currentActivity)}
          testId="panel-activity"
        />
        <Row label="Última atividade" value={formatOccurredAt(agent.lastActivityAt)} />
        <Row
          label="Posição"
          value={`${agent.position.x}, ${agent.position.y}${
            view?.usedFallbackLayout ? ' (layout fallback)' : ''
          }`}
          testId="panel-position"
        />
        <Row label="Conexão" value={connectionStatus} testId="panel-connection" />
        <Row
          label="Confiança"
          value={displayOptional(extras.statusConfidence)}
          testId="panel-confidence"
        />
        <Row
          label="Evidência"
          value={displayOptional(extras.statusEvidence)}
          testId="panel-evidence"
        />
      </dl>
    </aside>
  );
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="agent-panel__row">
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}
