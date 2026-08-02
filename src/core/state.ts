import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rncDir } from './paths.js';
import { Stack } from './composer.js';

/** Read/write project-local .rnc state files. */
export function ensureRncDir(cwd = process.cwd()): string {
  const dir = rncDir(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveStack(stack: Stack, cwd = process.cwd()): void {
  const dir = ensureRncDir(cwd);
  writeFileSync(join(dir, 'stack.json'), JSON.stringify(stack, null, 2) + '\n');
}

export function loadStack(cwd = process.cwd()): Stack | null {
  const p = join(rncDir(cwd), 'stack.json');
  if (!existsSync(p)) return null;
  return Stack.parse(JSON.parse(readFileSync(p, 'utf8')));
}
