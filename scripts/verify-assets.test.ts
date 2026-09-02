import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { REQUIRED_LICENSED_ASSETS } from './licensedAssets';
import { findMissingLicensedAssets } from './verify-assets';

describe('licensed asset check', () => {
  it('lists the six character sheets and the two interiors singles', () => {
    expect(REQUIRED_LICENSED_ASSETS).toEqual([
      'public/office/characters/agent-0.png',
      'public/office/characters/agent-1.png',
      'public/office/characters/agent-2.png',
      'public/office/characters/agent-3.png',
      'public/office/characters/agent-4.png',
      'public/office/characters/agent-5.png',
      'public/office/conference-table.png',
      'public/office/lounge-sofa.png',
    ]);
  });

  it('reports every required path when the tree is empty', () => {
    const root = join(tmpdir(), `agent-io-assets-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    expect(findMissingLicensedAssets(root)).toEqual([...REQUIRED_LICENSED_ASSETS]);
    rmSync(root, { recursive: true, force: true });
  });

  it('returns an empty list when all required files exist', () => {
    const root = join(tmpdir(), `agent-io-assets-ok-${Date.now()}`);
    for (const relative of REQUIRED_LICENSED_ASSETS) {
      const full = join(root, relative);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, 'placeholder');
    }
    expect(findMissingLicensedAssets(root)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
