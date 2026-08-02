import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Package root, resolved whether running from src/ (tsx) or dist/ (built). */
export const pkgRoot = resolve(here, '..', '..');
export const harnessDir = resolve(pkgRoot, 'harness');
export const blueprintsDir = resolve(harnessDir, 'blueprints');
export const profilesDir = resolve(harnessDir, 'profiles');

/** Project-local state, written into the user's project. */
export const rncDir = (cwd = process.cwd()) => resolve(cwd, '.rnc');
