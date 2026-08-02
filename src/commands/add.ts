import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { adapters, getAdapter } from '../adapters/index.js';
import type { AddResult } from '../adapters/types.js';
import { log } from '../core/log.js';

/**
 * rnc add <codex|kiro|opencode>
 * Renders the RNC MCP config + AGENTS.md/steering linkage + per-tool docs in
 * the target tool's dialect. AGENTS.md (the shared spine) must already exist —
 * run `rnc init` first.
 */
export async function addCmd(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) {
    log.err(`uso: rnc add <${Object.keys(adapters).join('|')}>`);
    process.exit(1);
  }
  const adapter = getAdapter(id);
  if (!adapter) {
    log.err(`ferramenta desconhecida '${id}'. Disponíveis: ${Object.keys(adapters).join(', ')}`);
    process.exit(1);
  }

  const cwd = process.cwd();
  if (!existsSync(join(cwd, 'AGENTS.md'))) {
    log.err('AGENTS.md ausente — rode `rnc init` primeiro (é a espinha compartilhada).');
    process.exit(1);
  }

  log.head(`rnc add ${adapter.label}`);
  log.info(`transporte MCP: ${adapter.transport === 'sse-native' ? 'SSE nativo (sem ponte)' : 'ponte mcp-remote (SSE→stdio)'}`);
  log.plain('');

  const res: AddResult = { writes: [], kept: [], notes: [] };
  adapter.apply(cwd, res);

  for (const w of res.writes) log.ok(w);
  for (const k of res.kept) log.warn(`existe, mantido: ${k}`);
  log.plain('');
  for (const n of res.notes) log.info(n);
  log.plain('');
  log.ok(`${adapter.label} conectado. Doc: docs/agents/${adapter.id}.md`);
}
