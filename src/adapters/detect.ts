import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { Detection } from './types.js';

/**
 * Presence checks for coding agents. `rnc add` lists what is actually installed
 * on the machine instead of asking the user to remember tool ids, so every
 * adapter answers "are you here?" through these three probes.
 *
 * They are all filesystem reads on purpose: spawning `which` per adapter would
 * cost a process each and still fail for GUI apps (Kiro) that ship no CLI.
 */

/** Executable named `bin` on PATH. */
export function onPath(bin: string): boolean {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        accessSync(join(dir, bin + ext), constants.X_OK);
        return true;
      } catch {
        // not here — keep looking
      }
    }
  }
  return false;
}

/** Any of these paths exists under $HOME (agents keep per-user config there). */
export function inHome(...rel: string[]): boolean {
  return rel.some((r) => existsSync(join(homedir(), r)));
}

/** macOS app bundle installed system-wide or per-user. */
export function appInstalled(...apps: string[]): boolean {
  if (process.platform !== 'darwin') return false;
  return apps.some((a) => existsSync(join('/Applications', a)) || existsSync(join(homedir(), 'Applications', a)));
}

/** First passing probe wins; its label becomes the picker hint. */
export function firstHit(checks: Array<[boolean, string]>): Detection {
  const hit = checks.find(([ok]) => ok);
  return hit ? { installed: true, how: hit[1] } : { installed: false };
}
