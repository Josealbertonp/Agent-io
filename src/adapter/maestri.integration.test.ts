import { describe, expect, it } from 'vitest';
import { applyEvents, createInitialState } from '../domain';
import { MaestriCliSource } from './maestriCliSource.cli';
import { MaestriPoller } from './poller';

const runIntegration = process.env.AGENT_IO_MAESTRI_INTEGRATION === '1';

describe.skipIf(!runIntegration)('Maestri CLI Live Integration Test (Read-Only)', () => {
  it('should successfully ping live maestri CLI and retrieve a valid workspace snapshot', async () => {
    const source = new MaestriCliSource({
      workspaceId: 'maestri-live-integration',
      includeAgentChecks: true,
      timeoutMs: 10000,
    });

    const isReachable = await source.ping();
    expect(isReachable).toBe(true);

    const snapshot = await source.getWorkspaceSnapshot();
    expect(snapshot.workspaceId).toBe('maestri-live-integration');
    expect(snapshot.connectionStatus).toBe('connected');
    expect(snapshot.rawHash).toBeDefined();
    expect(typeof snapshot.agents).toBe('object');
  });

  it('poller read-only: snapshot → eventos → projeção (sem escrita)', async () => {
    const source = new MaestriCliSource({
      workspaceId: 'maestri-live-integration',
      includeAgentChecks: true,
      timeoutMs: 10000,
    });
    const poller = new MaestriPoller(source, { intervalMs: 60_000, jitterRatio: 0 });
    const events = await poller.pollOnce();
    const snapshot = poller.getCheckpoint().lastSnapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot?.connectionStatus === 'connected' || snapshot?.connectionStatus === 'error').toBe(
      true
    );
    const state = applyEvents(createInitialState(), events);
    for (const agent of Object.values(state.agents)) {
      expect(agent.metadata?.statusConfidence).toBeUndefined();
      expect(agent.metadata?.statusEvidence).toBeUndefined();
    }
  });
});
