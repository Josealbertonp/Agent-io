# Gate final — Etapa 4: Interface Operacional

Status: documentação de gate registrada em 01/09/2026.

## Escopo entregue

### Apresentação e estado de UI

- `src/ui/selectionStore.ts` mantém somente `selectedAgentId` e `notice`, com seleção, limpeza manual, invalidação quando o agente é removido e aviso quando desconecta.
- `src/ui/eventLog.ts` implementa histórico de apresentação FIFO com teto de 200 eventos. É populado no ponto de ingestão do feeder e não é fonte de verdade; o estado canônico permanece no `ProjectedState`. O buffer é volátil e atualmente não deduplica por `eventId`.
- `src/ui/agentExtras.ts` extrai do evento mais recente os derivados `currentActivity`, `statusConfidence` e `statusEvidence`; ausência permanece `null` e é exibida como `sem dado`.
- `src/ui/filterAgents.ts` expõe `STATUS_FILTER_OPTIONS` derivado do schema de status e `filterAgentsByStatus`.
- `src/ui/displayLabels.ts` converte `unknown` para `desconhecido`, sem alterar o valor canônico.

### Seleção bidirecional

`AgentList.tsx` seleciona pelo React/`selectionStore`. `OfficeCanvas.tsx` sincroniza o store com Phaser por `setSelected` e registra `setOnAgentClick`; `OfficeScene` desenha o anel dourado no marcador selecionado. A cena não mantém estado canônico de agentes.

### Painel, timeline e filtros

- `AgentPanel.tsx` apresenta nome, role, provider, model, status, atividade, última atividade, posição/layout fallback, conexão, confiança e evidência — 11 campos derivados de `ProjectedState`, `connectionStatus`, `eventLog` e view-model.
- `EventTimeline.tsx` mostra horário, agente, tipo, descrição e status; ordena por `occurredAt` decrescente, depois `sequence` decrescente e `eventId` decrescente.
- `StatusFilter.tsx` suporta `todos` e todos os valores de `AgentStatus` do contrato; a timeline mantém eventos de conexão visíveis para contexto.

## Estados explícitos

Há estados sem dados para: nenhum agente projetado, nenhum evento, seleção removida/desconectada, lista filtrada vazia e seleção inexistente. Provider/model `unknown` vira `desconhecido`; valores ausentes viram `sem dado`, sem invenção. `ConnectionBanner.tsx` sinaliza `disconnected` e `error` como modo somente leitura, sem dados ao vivo.

## Decisão de contrato e débito

Foi adotada a Opção A: `src/adapter/differ.ts` estende o payload dos eventos com metadados de inferência (`statusConfidence`, `statusEvidence`, `statusInference` e, quando disponível, `currentActivity`), sem alterar o schema Zod nem o `Agent` canônico. Isso mantém os derivados rastreáveis no evento e evita duplicação de estado. Débito: o `eventLog` é apenas memória de apresentação, volátil e sem deduplicação por `eventId`.

## Débitos conhecidos

- Labels pixelados/truncados no Phaser.
- Grid visual dominante.
- O filtro não esconde agentes na cena, apenas lista/timeline.
- Inconsistência PT/EN no botão `error`.
- Bundle aproximado de 1,72 MB, sem code-split.
- `eventLog` volátil e sem dedupe por `eventId`.

## Evidência do gate

- Branch: `main`.
- Head confirmado antes do handoff: `61729c0cdcbaf2d7d0c64b537a55d9612144a5ce`.
- Working tree: limpo antes da alteração documental.
- Validação: `npm.cmd test` falhou ao carregar `vite.config.ts` por `Error: spawn EPERM` no `esbuild`; `npm.cmd run build` passou pelo `tsc` e falhou na etapa Vite pelo mesmo `spawn EPERM`. Não houve alteração em `src/`, testes ou configuração.
- Arquivos de implementação inspecionados: `src/ui/selectionStore.ts`, `eventLog.ts`, `agentExtras.ts`, `filterAgents.ts`, `displayLabels.ts`, `AgentList.tsx`, `OfficeCanvas.tsx`, `AgentPanel.tsx`, `EventTimeline.tsx`, `StatusFilter.tsx`, `ConnectionBanner.tsx`, `src/adapter/differ.ts`.

## Rastreabilidade e Preview

Preview Aleksandria do head final deve ser anexado ao handoff pelo responsável do Preview. Sem URL retornada e SHA coincidente com o HEAD final, o gate fica bloqueado; esta documentação não fabrica URL.
