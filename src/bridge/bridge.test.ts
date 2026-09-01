import { describe, expect, it, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Event } from '../contracts';
import { FakeWorkspaceSource } from '../adapter/fakeSource';
import { NormalizedAgentState, WorkspaceSnapshot } from '../adapter/types';
import { BridgeServer, formatSseFrame } from './server';
import { parseSseChunk, SseEventClient, computeReconnectBackoffMs } from './client';

function agent(id: string, name: string): NormalizedAgentState {
  return {
    id,
    workspaceId: 'ws-sse',
    name,
    provider: 'unknown',
    model: 'unknown',
    providerKnown: false,
    role: 'Agent',
    status: 'idle',
    statusConfidence: 'high',
    statusEvidence: 'test',
    position: { x: 1, y: 1 },
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    workspaceId: 'ws-sse',
    timestamp: '2026-08-31T12:00:00.000Z',
    connectionStatus: 'connected',
    rawHash: 'sse-1',
    agents: { 'agent-dev': agent('agent-dev', 'Developer') },
  };
}

async function readSseUntil(res: Response, predicate: (text: string) => boolean, timeoutMs = 1500): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no body');
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !predicate(text)) {
      const remaining = deadline - Date.now();
      const result = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), remaining);
        }),
      ]);
      if (result.done) break;
      if (result.value) text += decoder.decode(result.value, { stream: true });
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return text;
}

describe('Bridge SSE (Etapa 2.1)', () => {
  const checkpointPath = '.agent-io/test-bridge-checkpoint.json';
  let server: BridgeServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    try {
      await fs.unlink(path.resolve(checkpointPath));
    } catch {
      // ignore
    }
  });

  describe('parseSseChunk', () => {
    it('parseia frames text/event-stream (id/event/data)', () => {
      const chunk = formatSseFrame({
        eventId: 'evt-123',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { name: 'Test Agent' },
      });
      const parsed = parseSseChunk(chunk);
      expect(parsed?.eventId).toBe('evt-123');
      expect(parsed?.type).toBe('agent.connected');
      expect((parsed?.data as Event).workspaceId).toBe('ws-1');
    });
  });

  describe('Servidor SSE', () => {
    it('sobe em porta efêmera, emite frames e retoma por Last-Event-ID', async () => {
      const source = new FakeWorkspaceSource(snapshot());
      server = new BridgeServer({
        port: 0,
        source,
        checkpointPath,
        pollIntervalMs: 60_000,
      });
      await server.start();
      const port = server.getListeningPort();
      expect(port).toBeGreaterThan(0);

      const emitted = await server.pollOnce();
      expect(emitted.length).toBeGreaterThan(0);
      const firstId = emitted[0].eventId;
      const lastId = emitted[emitted.length - 1].eventId;

      const res = await fetch(`http://127.0.0.1:${port}/events`);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const body = await readSseUntil(res, (t) => t.includes(`id: ${lastId}`));
      expect(body).toContain('id:');
      expect(body).toContain('event:');
      expect(body).toContain('data:');
      expect(body).toContain(firstId);
      expect(body).toContain(lastId);

      const resume = await fetch(`http://127.0.0.1:${port}/events`, {
        headers: { 'Last-Event-ID': firstId },
      });
      const resumeBody = await readSseUntil(resume, (t) => t.includes('data:') || t.includes(': connected'));
      expect(resumeBody).not.toContain(`id: ${firstId}\n`);
      if (emitted.length > 1) {
        expect(resumeBody).toContain(`id: ${emitted[1].eventId}`);
      }

      const statusRes = await fetch(`http://127.0.0.1:${port}/status`);
      const statusJson = (await statusRes.json()) as { source: string; status: string };
      expect(statusRes.status).toBe(200);
      expect(statusJson.status).toBe('ok');
      expect(statusJson.source).toBe('fake');
    });
  });

  describe('Cliente SSE + reconnect', () => {
    it('handleMessage valida EventSchema e dispara callback', () => {
      const eventsReceived: Event[] = [];
      const client = new SseEventClient({
        url: 'http://localhost:3001/events',
        onEvent: (evt) => eventsReceived.push(evt),
      });

      const validChunk = formatSseFrame({
        eventId: 'evt-456',
        version: 1,
        type: 'agent.connected',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { status: 'idle' },
      });

      client.handleMessage(validChunk);
      expect(eventsReceived).toHaveLength(1);
      expect(eventsReceived[0].eventId).toBe('evt-456');
      expect(client.getLastEventId()).toBe('evt-456');
      expect(client.getTransportStatus()).toBe('disconnected');
      client.close();
      expect(client.isOpen).toBe(false);
    });

    it('computeReconnectBackoffMs cresce e respeita teto', () => {
      expect(computeReconnectBackoffMs(1, 10, 80, 2, 0)).toBe(20);
      expect(computeReconnectBackoffMs(2, 10, 80, 2, 0)).toBe(40);
      expect(computeReconnectBackoffMs(3, 10, 80, 2, 0)).toBe(80);
      expect(computeReconnectBackoffMs(8, 10, 80, 2, 0)).toBe(80);
    });

    it('reconnect: falhas incrementam backoff; sucesso reseta e entrega evento', async () => {
      const delays: number[] = [];
      let calls = 0;
      const frame = formatSseFrame({
        eventId: 'evt-re',
        version: 1,
        type: 'connection.status_changed',
        occurredAt: '2026-08-31T12:00:00.000Z',
        workspaceId: 'ws-1',
        source: 'maestri',
        payload: { status: 'connected' },
      });

      const fetchImpl: typeof fetch = async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error('network down');
        }
        return new Response(frame, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      };

      const received: Event[] = [];
      const client = new SseEventClient({
        url: 'http://example.test/events',
        onEvent: (evt) => {
          received.push(evt);
          client.close();
        },
        reconnectIntervalMs: 10,
        maxReconnectIntervalMs: 40,
        reconnectBackoffFactor: 2,
        jitterRatio: 0,
        fetchImpl,
        sleepFn: async (ms) => {
          delays.push(ms);
        },
      });

      client.connect();
      const deadline = Date.now() + 2000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }

      expect(received).toHaveLength(1);
      expect(received[0].eventId).toBe('evt-re');
      expect(calls).toBeGreaterThanOrEqual(3);
      expect(delays[0]).toBe(20);
      expect(delays[1]).toBe(40);
      expect(client.getConsecutiveFailures()).toBe(0);
      expect(client.getCurrentReconnectIntervalMs()).toBe(10);
      client.close();
    });
  });
});
