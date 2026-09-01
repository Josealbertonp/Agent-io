# Etapa 5 — Observabilidade em tempo real

Documentação do fluxo da branch `etapa-5-observabilidade-tempo-real` (PR #1).

## Fluxo ponta a ponta

`Maestri CLI` → `MaestriCliSource` (`execFile`, argv explícito, somente leitura) → `MaestriPoller` (polling padrão de 3 s, backoff exponencial limitado e jitter) → `differ` (eventos canônicos com IDs determinísticos) → `BridgeServer` → `SseEventClient` → `ingestAndRecord` → `ProjectedStore` + `eventLog` → React + Phaser.

O `BridgeServer` expõe `GET /events` em SSE e `GET /status`. Na UI, `feedProjectedStore.ts` concentra a ingestão: cada evento passa uma vez por `ingestAndRecord`, que atualiza o `ProjectedStore` e registra o histórico de apresentação. O `ProjectedStore` é a fonte de verdade; `eventLog` serve somente timeline/extras e deduplica por `eventId` usando `seenEventIds`.

## Eventos e contrato

Tipos utilizados: `agent.connected`, `agent.status_changed`, `agent.disconnected`, `activity.started` e `connection.status_changed`.

Os payloads carregam campos soltos de inferência (`statusConfidence`, `statusEvidence` e, quando disponível, `currentActivity`). Vigora a Opção A: esses campos permanecem no payload do evento; nada é gravado em `Agent.metadata`.

## Estados de conexão

`src/bridge/client.ts` define os cinco estados do transporte SSE: `disconnected`, `connecting`, `connected`, `reconnecting` e `error`. `src/ui/feedTransport.ts` mantém esse estado como UI-only e o repassa via `onStatus`.

Isso é distinto de `connectionStatus` canônico do workspace, armazenado no `ProjectedState`: o primeiro descreve o transporte entre UI e bridge; o segundo descreve a conexão observada no workspace Maestri.

## Reconexão, replay e reinício

O cliente SSE reconecta com backoff e jitter configuráveis, envia `Last-Event-ID` após receber eventos e atualiza o cursor pelo `id` do frame. A bridge mantém histórico dos últimos 50 eventos (`SSE_HISTORY_CAP`) e faz replay dos eventos posteriores ao ID solicitado; se o ID não estiver no histórico, retorna o histórico disponível.

O `eventLog` deduplica replay por `eventId`, evitando linhas duplicadas. O `ProjectedStore` também é idempotente. A bridge salva checkpoint do poller ao encerrar e o carrega ao iniciar; assim, após reinício, o poller retoma snapshot/IDs emitidos, enquanto clientes SSE usam `Last-Event-ID` para recuperar o histórico ainda disponível.

## Configuração de modo

- `VITE_AGENT_IO_FEED=fake|sse`: seleciona o feeder local ou SSE (default `fake`).
- `VITE_AGENT_IO_SSE_URL`: URL de `GET /events` (default `http://localhost:3001/events`).
- `AGENT_IO_FAKE_SOURCE=1`: faz a bridge usar `FakeWorkspaceSource`; sem essa variável, usa `MaestriCliSource`.

## `GET /status`

Além do status operacional e clientes conectados, a resposta inclui:

- `source`: `fake` ou `maestri`;
- `eventHistorySize`: quantidade atual no replay da bridge (máximo 50);
- `lastPollError`: última falha do poller ou `null`;
- `maestriConnection`: último `connectionStatus` observado no snapshot ou `null`;
- `checkpoint`: cursores/estado persistido do poller.

## Limitações conhecidas

- Replay SSE está limitado aos últimos 50 eventos; eventos anteriores ao histórico não são recuperáveis pela bridge.
- Checkpoint depende do arquivo local e não é armazenamento distribuído.
- O filtro visual de status não sincroniza a visibilidade dos agentes na cena Phaser.
- Labels pixelados/truncados e grid do piso dominante permanecem como backlog visual.
- Há inconsistência PT/EN no token `error`.
- `eventLog` é volátil (apesar da deduplicação por `eventId` durante sua vida útil).
- Bundle aproximado de 1,72 MB, sem code-split.
- A fonte CLI depende da disponibilidade/permissão do binário Maestri e pode reportar `error` sem dados de agentes.

## Rastreabilidade

Arquivos principais: `src/adapter/maestriCliSource.cli.ts`, `src/adapter/poller.ts`, `src/adapter/differ.ts`, `src/bridge/server.ts`, `src/bridge/client.ts`, `src/ui/feedProjectedStore.ts`, `src/ui/feedTransport.ts`, `src/ui/eventLog.ts` e `src/domain/projection.ts`.
