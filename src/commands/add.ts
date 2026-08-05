import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { adapters, getAdapter, probeAll, type Probe } from '../adapters/index.js';
import type { AddResult } from '../adapters/types.js';
import { parseFlags } from '../core/args.js';
import { log } from '../core/log.js';

const IDS = Object.keys(adapters).join('|');

/**
 * rnc add [claude|codex|kiro|opencode]
 *
 * With no argument it detects which agents are installed on the machine and
 * lets you pick from that list — nobody should have to remember tool ids to
 * find out which of their agents the harness supports.
 *
 * Connecting an agent hands it the RNC MCP server: each adapter writes the
 * server entry in its own config dialect (all pointing at `rnc mcp proxy`, so
 * no token lands in the repo), plus the rules linkage and a per-tool doc.
 * AGENTS.md (the shared spine) must already exist — run `rnc init` first.
 */
export async function addCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);

  const cwd = process.cwd();
  if (!existsSync(join(cwd, 'AGENTS.md'))) {
    log.err('AGENTS.md ausente — rode `rnc init` primeiro (é a espinha compartilhada).');
    process.exit(1);
  }

  const ids = _.length ? explicit(_) : await choose(Boolean(flags.all));

  for (const id of ids) {
    const adapter = getAdapter(id)!;
    log.head(`rnc add ${adapter.label}`);
    log.info('MCP: servidor stdio local `rnc mcp proxy` (ponte pro SSE do RNC, sem token no arquivo)');
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
}

/** Ids given on the command line — validated before anything is written. */
function explicit(args: string[]): string[] {
  const unknown = args.filter((a) => !getAdapter(a));
  if (unknown.length) {
    log.err(`ferramenta desconhecida '${unknown.join("', '")}'. Disponíveis: ${Object.keys(adapters).join(', ')}`);
    process.exit(1);
  }
  return [...new Set(args)];
}

/** No argument: detect what is installed and let the user choose. */
async function choose(all: boolean): Promise<string[]> {
  const probes = probeAll();
  const installed = probes.filter((x) => x.detection.installed);

  if (all) {
    if (!installed.length) {
      log.err('nenhum agente detectado nesta máquina — passe o id explicitamente: `rnc add <' + IDS + '>`');
      process.exit(1);
    }
    return installed.map((x) => x.adapter.id);
  }

  // No TTY (an agent running us over a pipe, or CI): a prompt would crash with
  // uv_tty_init EINVAL. Report what was detected and how to ask for it.
  if (!process.stdin.isTTY) {
    process.stderr.write(
      'rnc add: ambiente não-interativo — informe o agente.\n' +
        (installed.length
          ? `Detectados: ${installed.map((x) => x.adapter.id).join(', ')}\n` +
            `  rnc add ${installed.map((x) => x.adapter.id).join(' ')}   # ou: rnc add --all\n`
          : `Nenhum agente detectado. Disponíveis: ${Object.keys(adapters).join(', ')}\n`),
    );
    process.exit(1);
  }

  if (!installed.length) log.warn('nenhum agente detectado — a lista abaixo mostra todos os suportados.');

  const choice = await p.multiselect({
    message: 'Conectar quais agentes ao RNC?',
    options: probes.map((x: Probe) => ({
      value: x.adapter.id,
      label: x.adapter.label,
      hint: x.detection.installed ? `detectado · ${x.detection.how}` : 'não detectado',
    })),
    initialValues: installed.map((x) => x.adapter.id),
    required: true,
  });
  if (p.isCancel(choice)) {
    p.cancel('cancelado');
    process.exit(0);
  }
  return choice as string[];
}
