import { ConnectionStatus } from '../contracts';

export interface ConnectionBannerProps {
  connectionStatus: ConnectionStatus;
}

export function ConnectionBanner({ connectionStatus }: ConnectionBannerProps) {
  const offline = connectionStatus === 'disconnected' || connectionStatus === 'error';
  if (!offline) return null;

  return (
    <div
      className="connection-banner"
      data-testid="connection-banner"
      role="status"
    >
      Maestri {connectionStatus === 'error' ? 'com erro' : 'desconectado'} — modo somente
      leitura, sem dados ao vivo.
    </div>
  );
}
