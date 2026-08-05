import type { Adapter, Detection } from './types.js';
import { claude } from './claude.js';
import { codex } from './codex.js';
import { kiro } from './kiro.js';
import { opencode } from './opencode.js';

/** Tool adapters, in picker order. */
export const adapters: Record<string, Adapter> = {
  claude,
  codex,
  kiro,
  opencode,
};

export function getAdapter(id: string): Adapter | undefined {
  return adapters[id];
}

export interface Probe {
  adapter: Adapter;
  detection: Detection;
}

/** Every adapter with its presence probe — installed ones first. */
export function probeAll(): Probe[] {
  return Object.values(adapters)
    .map((adapter) => ({ adapter, detection: adapter.detect() }))
    .sort((a, b) => Number(b.detection.installed) - Number(a.detection.installed));
}
