import { WorkspaceSource, WorkspaceSnapshot } from './types';

/**
 * Fonte em memória para testes e `AGENT_IO_FAKE_SOURCE=1`.
 * Não toca no Maestri.
 */
export class FakeWorkspaceSource implements WorkspaceSource {
  public snapshotToReturn: WorkspaceSnapshot;
  public throwError: Error | null = null;

  constructor(initial: WorkspaceSnapshot) {
    this.snapshotToReturn = initial;
  }

  public async getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
    if (this.throwError) {
      throw this.throwError;
    }
    return this.snapshotToReturn;
  }
}

export function createDemoSnapshot(workspaceId: string = 'maestri-local'): WorkspaceSnapshot {
  return {
    workspaceId,
    timestamp: new Date().toISOString(),
    connectionStatus: 'connected',
    rawHash: 'demo-static',
    agents: {
      'agent-developer': {
        id: 'agent-developer',
        workspaceId,
        name: 'Developer',
        provider: 'unknown',
        model: 'unknown',
        providerKnown: false,
        role: 'Implementador',
        status: 'idle',
        statusConfidence: 'high',
        statusEvidence: 'self-default-idle',
        position: { x: 2, y: 2 },
      },
    },
  };
}
