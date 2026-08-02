import type { Adapter } from './types.js';
import { codex } from './codex.js';
import { kiro } from './kiro.js';
import { opencode } from './opencode.js';

/** Tool adapters. Claude Code is wired by `rnc init` (.mcp.json + CLAUDE.md). */
export const adapters: Record<string, Adapter> = {
  codex,
  kiro,
  opencode,
};

export function getAdapter(id: string): Adapter | undefined {
  return adapters[id];
}
