import type { ReactNode } from 'react';
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
          <div className="panel-empty" data-testid="panel-empty">
            <span className="panel-empty__icon" aria-hidden>
              ◇
            </span>
            <p className="empty-state">Selecione um agente no escritório ou na lista.</p>
          </div>
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
        <div>
          <p className="agent-panel__kicker">Agente</p>
          <h2>{agent.name}</h2>
        </div>
        <button type="button" className="agent-panel__close" onClick={() => clear('manual')}>
          Fechar
        </button>
      </header>

      <div className="agent-panel__status" style={{ borderColor: visual.hex }}>
        <span className="status-dot" style={{ background: visual.hex }} aria-hidden>
          {visual.icon}
        </span>
        <span data-testid="panel-status" style={{ color: visual.hex }}>
          {visual.label}
        </span>
      </div>

      <Section title="Identidade">
        <Row label="Role" value={agent.role} />
        <Row label="Provider" value={displayProviderOrModel(agent.provider)} testId="panel-provider" />
        <Row label="Model" value={displayProviderOrModel(agent.model)} testId="panel-model" />
      </Section>

      <Section title="Atividade">
        <Row
          label="Atividade"
          value={displayOptional(extras.currentActivity)}
          testId="panel-activity"
        />
        <Row label="Última atividade" value={formatOccurredAt(agent.lastActivityAt)} />
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
      </Section>

      <Section title="Posição">
        <Row
          label="Posição"
          value={`${agent.position.x}, ${agent.position.y}${
            view?.usedFallbackLayout ? ' (layout fallback)' : ''
          }`}
          testId="panel-position"
        />
      </Section>

      <Section title="Conexão">
        <Row label="Conexão" value={connectionStatus} testId="panel-connection" />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="agent-panel__section">
      <h3 className="agent-panel__section-title">{title}</h3>
      <dl className="agent-panel__fields">{children}</dl>
    </section>
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
