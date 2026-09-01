import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ProjectedState } from './types';
import { serializeState, deserializeState } from './snapshot';

export const DEFAULT_SNAPSHOT_PATH = '.agent-io/snapshot.json';

/**
 * Grava o snapshot em arquivo no sistema de arquivos local (ambiente Node.js).
 */
export async function saveSnapshotToFile(
  state: ProjectedState,
  filePath: string = DEFAULT_SNAPSHOT_PATH
): Promise<void> {
  const serialized = serializeState(state);
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolvedPath, serialized, 'utf-8');
}

/**
 * Lê e restaura o snapshot a partir de um arquivo no sistema de arquivos local (ambiente Node.js).
 */
export async function loadSnapshotFromFile(
  filePath: string = DEFAULT_SNAPSHOT_PATH
): Promise<ProjectedState> {
  const resolvedPath = path.resolve(filePath);
  const content = await fs.readFile(resolvedPath, 'utf-8');
  return deserializeState(content);
}
