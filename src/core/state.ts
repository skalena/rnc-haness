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

/** Which milestones have been marked done. */
export function loadProgress(cwd = process.cwd()): string[] {
  const p = join(rncDir(cwd), 'progress.json');
  if (!existsSync(p)) return [];
  try {
    const d = JSON.parse(readFileSync(p, 'utf8')) as { done?: string[] };
    return d.done ?? [];
  } catch {
    return [];
  }
}

export function markDone(id: string, cwd = process.cwd()): void {
  const dir = ensureRncDir(cwd);
  const done = new Set(loadProgress(cwd));
  done.add(id);
  writeFileSync(join(dir, 'progress.json'), JSON.stringify({ done: [...done] }, null, 2) + '\n');
}
