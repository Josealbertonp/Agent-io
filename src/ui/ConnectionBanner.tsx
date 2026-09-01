import { ConnectionStatus } from '../contracts';
import { FeedMode } from './feedConfig';
import { SseTransportStatus } from '../bridge/client';

export interface ConnectionBannerProps {
  connectionStatus: ConnectionStatus;
  feedMode?: FeedMode;
  transportStatus?: SseTransportStatus;
  transportDetail?: string | null;
}

function maestriLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Maestri conectado';
    case 'connecting':
      return 'Maestri conectando';
    case 'reconnecting':
      return 'Maestri reconectando';
    case 'degraded':
      return 'Maestri degradado';
    case 'error':
      return 'Maestri com erro';
    default:
      return 'Maestri desconectado';
  }
}

function transportLabel(status: SseTransportStatus): string {
  switch (status) {
    case 'connected':
      return 'SSE conectado';
    case 'connecting':
      return 'SSE conectando';
    case 'reconnecting':
      return 'SSE reconectando';
    case 'error':
      return 'SSE com erro';
    default:
      return 'SSE desconectado';
  }
}

function tone(
  feedMode: FeedMode,
  maestri: ConnectionStatus,
  transport: SseTransportStatus
): 'live' | 'demo' | 'warn' | 'bad' {
  if (feedMode === 'fake') return 'demo';
  if (transport === 'error' || maestri === 'error' || transport === 'disconnected') return 'bad';
  if (transport === 'reconnecting' || transport === 'connecting' || maestri === 'reconnecting') {
    return 'warn';
  }
  if (transport === 'connected' && maestri === 'connected') return 'live';
  return 'warn';
}

export function ConnectionBanner({
  connectionStatus,
  feedMode = 'fake',
  transportStatus = 'disconnected',
  transportDetail = null,
}: ConnectionBannerProps) {
  const kind = tone(feedMode, connectionStatus, transportStatus);
  const isLive = feedMode === 'sse';
  const summary = isLive
    ? `Ao vivo · ${transportLabel(transportStatus)} · ${maestriLabel(connectionStatus)}`
    : `Demo (fake) · dados locais, não é o Maestri ao vivo · ${maestriLabel(connectionStatus)}`;
  const detail = isLive && transportDetail ? ` — ${transportDetail}` : '';

  return (
    <div
      className={`connection-banner connection-banner--${kind}`}
      data-testid="connection-banner"
      data-feed-mode={feedMode}
      data-transport={transportStatus}
      data-maestri={connectionStatus}
      role="status"
    >
      {summary}
      {detail}
    </div>
  );
}
