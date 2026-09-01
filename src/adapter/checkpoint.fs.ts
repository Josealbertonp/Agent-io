import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { AdapterCheckpoint } from './types';
import { createInitialCheckpoint, parseCheckpoint, serializeCheckpoint } from './checkpoint';

export const DEFAULT_CHECKPOINT_PATH = '.agent-io/adapter-checkpoint.json';

/**
 * I/O de arquivo do checkpoint. Node-only — não reexportar em `src/adapter/index.ts`.
 * Nome `*.fs.ts` (não `*.node.ts`): o sufixo `.node` é addon nativo no ESM do Node/tsx.
 */
export async function saveCheckpointToFile(
  checkpoint: AdapterCheckpoint,
  filePath: string = DEFAULT_CHECKPOINT_PATH
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolvedPath, serializeCheckpoint(checkpoint), 'utf-8');
}

export async function loadCheckpointFromFile(
  filePath: string = DEFAULT_CHECKPOINT_PATH
): Promise<AdapterCheckpoint> {
  try {
    const resolvedPath = path.resolve(filePath);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return parseCheckpoint(JSON.parse(content));
  } catch {
    return createInitialCheckpoint();
  }
}
