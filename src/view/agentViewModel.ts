import { Agent } from '../contracts';
import { StatusVisual, statusVisualFor } from './statusVisual';
import { resolveViewPositions } from './layout';
import { LABEL, resolveMetaOffsets } from './labelLayout';
import { characterIndexForAgentId } from './characterVisual';

export interface AgentView {
  id: string;
  label: string;
  role: string;
  status: Agent['status'];
  statusVisual: StatusVisual;
  x: number;
  y: number;
  usedFallbackLayout: boolean;
  sourcePosition: { x: number; y: number };
  provider: string;
  model: string;
  providerBadge: string;
  metaOffsetY: number;
  characterIndex: number;
}

function providerBadge(provider: string, model: string): string {
  const shortProvider = provider.length > 10 ? `${provider.slice(0, 10)}…` : provider;
  const shortModel = model.length > 14 ? `${model.slice(0, 14)}…` : model;
  return `${shortProvider}/${shortModel}`;
}

/**
 * Mapeia Agent do domínio → view-model da cena.
 * Puro, sem efeitos colaterais. A posição real permanece em Agent.position.
 */
export function toAgentView(agent: Agent, layout: { x: number; y: number; usedFallback: boolean }): AgentView {
  return {
    id: agent.id,
    label: agent.name,
    role: agent.role,
    status: agent.status,
    statusVisual: statusVisualFor(agent.status),
    x: layout.x,
    y: layout.y,
    usedFallbackLayout: layout.usedFallback,
    sourcePosition: { x: agent.position.x, y: agent.position.y },
    provider: agent.provider,
    model: agent.model,
    providerBadge: providerBadge(agent.provider, agent.model),
    metaOffsetY: LABEL.metaOffsetY,
    characterIndex: characterIndexForAgentId(agent.id),
  };
}

export function buildAgentViews(agents: readonly Agent[]): AgentView[] {
  const layout = resolveViewPositions(agents);
  const views = [...agents]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((agent) => {
      const point = layout.get(agent.id) ?? { x: 0, y: 0, usedFallback: true };
      return toAgentView(agent, point);
    });
  const offsets = resolveMetaOffsets(views);
  return views.map((view) => ({
    ...view,
    metaOffsetY: offsets.get(view.id) ?? LABEL.metaOffsetY,
  }));
}

let cachedAgents: Record<string, Agent> | null = null;
let cachedViews: AgentView[] = [];

/** Memoiza pelo reference dos agents do ProjectedState. */
export function selectAgentViews(agents: Record<string, Agent>): AgentView[] {
  if (agents === cachedAgents) return cachedViews;
  cachedAgents = agents;
  cachedViews = buildAgentViews(Object.values(agents));
  return cachedViews;
}

export function resetAgentViewCache(): void {
  cachedAgents = null;
  cachedViews = [];
}
