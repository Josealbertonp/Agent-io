import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { Event } from '../contracts';
import { WorkspaceSource } from '../adapter/types';
import { MaestriCliSource } from '../adapter/maestriCliSource.cli';
import { MaestriPoller } from '../adapter/poller';
import { FakeWorkspaceSource, createDemoSnapshot } from '../adapter/fakeSource';
import { loadCheckpointFromFile, saveCheckpointToFile, DEFAULT_CHECKPOINT_PATH } from '../adapter/checkpoint.fs';
import { DEFAULT_SSE_PORT } from './client';

export const SSE_HISTORY_CAP = 50;

export interface BridgeServerOptions {
  port?: number;
  source?: WorkspaceSource;
  checkpointPath?: string;
  pollIntervalMs?: number;
}

/**
 * Ponte HTTP SSE somente-leitura (eventos do Maestri → clientes).
 *
 * Subir (default = MaestriCliSource, comandos list/check/debug apenas):
 *   npm run bridge
 * Porta default: 3001 (DEFAULT_SSE_PORT, alinhada ao cliente SSE).
 *
 * Testar sem Maestri (fonte fake em memória):
 *   AGENT_IO_FAKE_SOURCE=1 npm run bridge
 *
 * Endpoints:
 *   GET /events  text/event-stream  (retoma por header Last-Event-ID)
 *   GET /status  application/json
 */
export class BridgeServer {
  private readonly port: number;
  private readonly source: WorkspaceSource;
  private readonly checkpointPath: string;
  private readonly pollIntervalMs: number;

  private server: Server | null = null;
  private poller: MaestriPoller | null = null;
  private clients: Set<ServerResponse> = new Set();
  private eventHistory: Event[] = [];
  private readonly sourceKind: 'fake' | 'maestri';

  constructor(options: BridgeServerOptions = {}) {
    this.port = options.port ?? DEFAULT_SSE_PORT;
    this.source = options.source || createDefaultSource();
    this.checkpointPath = options.checkpointPath || DEFAULT_CHECKPOINT_PATH;
    this.pollIntervalMs = options.pollIntervalMs || 3000;
    this.sourceKind = this.source instanceof FakeWorkspaceSource ? 'fake' : 'maestri';
  }

  public getListeningPort(): number {
    const address = this.server?.address();
    if (typeof address === 'object' && address) {
      return address.port;
    }
    return this.port;
  }

  public async pollOnce(): Promise<Event[]> {
    if (!this.poller) return [];
    return this.poller.pollOnce();
  }

  public getEventHistory(): Event[] {
    return [...this.eventHistory];
  }

  public async start(): Promise<void> {
    const checkpoint = await loadCheckpointFromFile(this.checkpointPath);

    this.poller = new MaestriPoller(this.source, {
      intervalMs: this.pollIntervalMs,
      checkpoint,
      onEvents: (events) => this.broadcastEvents(events),
    });

    this.server = createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve) => {
      this.server?.listen(this.port, () => {
        resolve();
      });
    });

    this.poller.start();
  }

  public async stop(): Promise<void> {
    this.poller?.stop();
    if (this.poller) {
      await saveCheckpointToFile(this.poller.getCheckpoint(), this.checkpointPath);
    }

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split('?')[0];

    if (url === '/events') {
      this.handleSseConnection(req, res);
      return;
    }

    if (url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          source: this.sourceKind,
          connectedClients: this.clients.size,
          eventHistorySize: this.eventHistory.length,
          lastPollError: this.poller?.getLastError() ?? null,
          maestriConnection: this.poller?.getCheckpoint().lastSnapshot?.connectionStatus ?? null,
          checkpoint: this.poller?.getCheckpoint(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private handleSseConnection(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write(': connected to maestri event stream\n\n');

    const lastEventIdHeader = req.headers['last-event-id'];
    const lastEventId = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader;
    const toReplay = this.eventsAfter(lastEventId);

    for (const event of toReplay) {
      res.write(formatSseFrame(event));
    }

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });
  }

  private eventsAfter(lastEventId: string | undefined): Event[] {
    if (!lastEventId) return [...this.eventHistory];
    const idx = this.eventHistory.findIndex((event) => event.eventId === lastEventId);
    if (idx === -1) return [...this.eventHistory];
    return this.eventHistory.slice(idx + 1);
  }

  private broadcastEvents(events: Event[]): void {
    for (const event of events) {
      this.eventHistory.push(event);
      if (this.eventHistory.length > SSE_HISTORY_CAP) {
        this.eventHistory.shift();
      }

      const chunk = formatSseFrame(event);
      for (const client of this.clients) {
        client.write(chunk);
      }
    }
  }
}

export function formatSseFrame(event: Event): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createDefaultSource(): WorkspaceSource {
  if (process.env.AGENT_IO_FAKE_SOURCE === '1') {
    return new FakeWorkspaceSource(createDemoSnapshot());
  }
  return new MaestriCliSource();
}

const isDirectRun = process.argv[1] && /server\.(ts|js|mts|cts)$/.test(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  const port = parseInt(process.env.PORT || String(DEFAULT_SSE_PORT), 10);
  const bridge = new BridgeServer({ port });
  bridge.start().then(() => {
    console.log(`[Agent-IO Bridge] Servidor SSE iniciado na porta ${port} (GET /events)`);
    if (process.env.AGENT_IO_FAKE_SOURCE === '1') {
      console.log('[Agent-IO Bridge] Fonte: FakeWorkspaceSource (AGENT_IO_FAKE_SOURCE=1)');
    } else {
      console.log('[Agent-IO Bridge] Fonte: MaestriCliSource (somente list/check/debug)');
    }
  });

  process.on('SIGINT', async () => {
    console.log('\n[Agent-IO Bridge] Encerrando servidor e salvando checkpoint...');
    await bridge.stop();
    process.exit(0);
  });
}
