import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceSource, WorkspaceSnapshot } from './types';
import { computeStableSnapshotHash, normalizeMaestriWorkspace, parseMaestriListOutput } from './parser';

const execFileAsync = promisify(execFile);

export interface MaestriCliSourceOptions {
  workspaceId?: string;
  cliPath?: string;
  includeAgentChecks?: boolean;
  timeoutMs?: number;
}

/**
 * Fonte de workspace baseada na CLI nativa do Maestri (somente leitura).
 * Executa apenas `maestri list`, opcionalmente `maestri check <nome>` e `maestri debug`.
 * Usa execFile (argv em array) — sem shell, sem interpolação de nomes.
 *
 * Node-only. Não reexportar em `src/adapter/index.ts`.
 * Nome `*.cli.ts` (não `*.node.ts`): o sufixo `.node` é addon nativo no ESM do Node/tsx.
 */
export class MaestriCliSource implements WorkspaceSource {
  private readonly workspaceId: string;
  private readonly cliPath: string;
  private readonly includeAgentChecks: boolean;
  private readonly timeoutMs: number;

  constructor(options: MaestriCliSourceOptions = {}) {
    this.workspaceId = options.workspaceId || 'maestri-local';
    this.cliPath = options.cliPath || process.env.MAESTRI_CLI || 'maestri';
    this.includeAgentChecks = options.includeAgentChecks ?? true;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  public async ping(): Promise<boolean> {
    try {
      await execFileAsync(this.cliPath, ['debug'], { timeout: this.timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  public async getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
    try {
      const { stdout: listStdout } = await execFileAsync(this.cliPath, ['list'], {
        timeout: this.timeoutMs,
      });

      const raw = parseMaestriListOutput(listStdout, this.workspaceId);

      if (this.includeAgentChecks && raw.connectedAgents.length > 0) {
        for (const agent of raw.connectedAgents) {
          try {
            const { stdout: checkStdout } = await execFileAsync(
              this.cliPath,
              ['check', agent.name],
              { timeout: this.timeoutMs }
            );
            agent.terminalOutputSample = checkStdout;
            agent.lastCheckedAt = new Date().toISOString();
          } catch {
            // Se check falhar ou demorar, prossegue com estado padrão (idle)
          }
        }
      }

      return normalizeMaestriWorkspace(raw);
    } catch {
      return {
        workspaceId: this.workspaceId,
        timestamp: new Date().toISOString(),
        connectionStatus: 'error',
        agents: {},
        rawHash: computeStableSnapshotHash({ connectionStatus: 'error', agents: {} }),
      };
    }
  }
}
