import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AddResult {
  writes: string[];
  kept: string[];
  notes: string[];
}

/** Whether the agent is installed on this machine, and what proved it. */
export interface Detection {
  installed: boolean;
  /** Human-readable evidence — shown as the picker hint. */
  how?: string;
}

export interface Adapter {
  id: string;
  label: string;
  /** How the agent reaches the RNC MCP server. */
  transport: 'stdio-proxy';
  /** Is this agent present on the machine? Drives the `rnc add` picker. */
  detect(): Detection;
  apply(cwd: string, res: AddResult): void;
}

/** Write a file, skipping (and recording) if it already exists. */
export function write(path: string, content: string, res: AddResult, rel: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    res.kept.push(rel);
    return;
  }
  writeFileSync(path, content);
  res.writes.push(rel);
}

/** Default hosted API base. Config files may not interpolate RNC_BASE_URL. */
export const DEFAULT_BASE = 'https://api.rnc.skalena.co';

/**
 * The RNC MCP server as an agent must spawn it: a local stdio process that
 * fronts the SSE endpoint and reads the credential written by `rnc mcp login`.
 *
 * Every adapter uses this same pair. Pointing agents straight at the SSE URL
 * would need an `Authorization: Bearer <token>` header in the config file —
 * which means a secret in the repo, or an env var the user has to export and
 * then restart the agent to pick up. Through the proxy the credential store is
 * the only place the token lives, so `rnc add` alone is enough to hand the
 * server over: the config it writes carries no secret and is safe to commit.
 */
export const MCP_COMMAND = 'npx';
export const MCP_ARGS = ['-y', '@skalena/rnc', 'mcp', 'proxy'];

/** Shared note — the one step left after `rnc add`. */
export const LOGIN_NOTE =
  'Se ainda não autenticou: `rnc mcp login`. O proxy lê ~/.rnc/credentials.json — nenhum token vai pro arquivo de config.';
