import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { baseUrl, readConfig, setDefaultWorkspace } from '../core/config.js';
import { loadCredential, isExpired } from '../core/credentials.js';
import { whoami } from '../core/rnc.js';
import { pickWorkspace } from '../core/pick.js';
import { log } from '../core/log.js';

/**
 * rnc workspaces           list, then pick the one to work with
 * rnc workspaces --list    list only (scriptable / non-interactive)
 *
 * Once a default is set the other commands stop asking, so this is the way to
 * see what the token can reach and switch between legacies.
 */
export async function workspacesCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);

  const cred = loadCredential(base);
  if (!cred || isExpired(cred)) {
    log.err(`não autenticado (${base}) — rode: ${pc.cyan('rnc mcp login')}`);
    process.exit(1);
  }

  const me = await whoami(base, cred.accessToken);
  const current = readConfig().defaultWorkspace;

  log.head(`Workspaces RNC (${me.workspaces.length})`);
  if (me.workspaces.length === 0) {
    log.info('nenhum workspace visível para este tenant');
    return;
  }
  for (const w of me.workspaces) {
    const mark = w.id === current ? pc.green('★') : ' ';
    const status = w.status === 'READY' ? pc.dim(w.status) : pc.yellow(w.status);
    log.plain(`   ${mark} ${pc.bold(w.name.padEnd(22))} ${status.padEnd(16)} ${String(w.modules).padStart(4)} módulos  ${pc.dim(w.id)}`);
  }
  log.plain('');
  log.info(`★ = padrão atual${current ? '' : ' (nenhum definido)'}`);

  // --list keeps it read-only; the bare command is the "choose one" flow
  if (flags.list || !process.stdout.isTTY) return;

  log.plain('');
  const ws = await pickWorkspace(base, cred.accessToken, 'Trabalhar com qual workspace?');
  setDefaultWorkspace(ws.id);
  log.ok(`workspace padrão: ${ws.name}  (${ws.modules} módulos)`);
  log.plain('');
  log.plain(`  próximo: ${pc.cyan('rnc analyze')}`);
}
