# Etapa 5.1 — UI Visual Refinement

Scope: UI-only refinement on branch `feature/observability-dashboard-refinement`, commit `aaaad6c`, PR #2.

## Phaser presentation

The office scene now identifies each agent with a minimal marker label: short name plus status dot. Detailed role, provider, model, and activity information is not duplicated in the scene; it is shown only in the side panel. The floor uses the `FLOOR_ALT` asset at reduced alpha for a quieter background.

Click-to-select and synchronization with the canonical `ProjectedState` are unchanged. Relevant implementation files are `src/scene/agentMarker.ts`, `src/view/labelLayout.ts`, `src/view/officeMap.ts`, and `src/scene/OfficeScene.ts`.

## React dashboard layout

- The agent list uses compact rows for quick scanning and selection.
- `AgentPanel` groups details into Identity, Activity, Position, and Connection sections and provides a useful empty state when no agent is selected.
- `EventTimeline` is presented as an activity stream.
- The header and `ConnectionBanner` communicate the Agent-IO product identity, DEMO versus LIVE mode, connection state, agent count, and last update.

## State and contract boundaries

The state model is unchanged. `ProjectedState` remains the only canonical UI state for projected workspace data. `selectionStore` owns selection UI state, `feedTransport` owns SSE transport presentation state, and `eventLog` owns presentation history, with the same roles established in Etapas 4 and 5. There is no contract or domain-model change.

No contracts are modified, and no presentation detail is promoted into `Agent` or another canonical domain record.

## Information ownership rule

The scene identifies the agent; the side panel owns the details. This separation prevents duplicated information and keeps the Phaser canvas legible while preserving access to the full operational context in React.

## Traceability

Primary UI files: `src/scene/agentMarker.ts`, `src/view/labelLayout.ts`, `src/view/officeMap.ts`, `src/scene/OfficeScene.ts`, `src/ui/AgentList.tsx`, `src/ui/AgentPanel.tsx`, `src/ui/EventTimeline.tsx`, `src/ui/ConnectionBanner.tsx`, `src/ui/feedTransport.ts`, `src/ui/eventLog.ts`, and `src/domain/` projection state files.
