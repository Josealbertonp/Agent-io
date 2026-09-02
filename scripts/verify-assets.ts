import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REQUIRED_LICENSED_ASSETS } from './licensedAssets';

export function findMissingLicensedAssets(
  rootDir: string,
  required: readonly string[] = REQUIRED_LICENSED_ASSETS
): string[] {
  return required.filter((relative) => !existsSync(resolve(rootDir, relative)));
}

function main(): void {
  const missing = findMissingLicensedAssets(process.cwd());
  if (missing.length === 0) {
    console.log('Licensed LimeZu assets are present locally.');
    return;
  }

  console.error('Missing licensed LimeZu assets (not shipped in this repository):');
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
  console.error('');
  console.error('Obtain the assets separately from LimeZu: https://limezu.itch.io/');
  console.error('Place the required copies in the paths above. See README.md (Licensed visual assets).');
  process.exitCode = 1;
}

const entry = process.argv[1]?.replace(/\\/g, '/');
if (entry?.endsWith('verify-assets.ts') || entry?.endsWith('verify-assets.js')) {
  main();
}
