import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AddResult {
  writes: string[];
  kept: string[];
  notes: string[];
}

export interface Adapter {
  id: string;
  label: string;
  /** Transport used to reach the RNC MCP server. */
  transport: 'sse-native' | 'stdio-bridge';
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

/** Shared note about the token placeholder — agents differ on env expansion. */
export const TOKEN_NOTE =
  'Substitua ${RNC_TOKEN} pelo token de `rnc mcp login` (~/.rnc/credentials.json), ou garanta que o agente expande a env. Nunca comite o token.';
