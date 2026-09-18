import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppMetadata {
  name: string;
  version: string;
}

/** Resolve package metadata from workspace and compiled production layouts. */
function loadAppMetadata(): AppMetadata {
  const candidates = [
    resolve(process.cwd(), 'apps/api/package.json'),
    resolve(process.cwd(), 'package.json'),
    resolve(__dirname, '../../../../apps/api/package.json'),
    resolve(__dirname, '../../../package.json'),
  ];
  const packagePath = candidates.find((candidate) => existsSync(candidate));
  if (!packagePath) throw new Error('PulseDock API package metadata could not be located');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(packagePath) as AppMetadata;
}

export const appMetadata = loadAppMetadata();
