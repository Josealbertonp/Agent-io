import { describe, expect, it } from 'vitest';
import { MaestriCliSource } from './maestriCliSource.cli';

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
});
