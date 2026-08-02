import { parseFlags } from '../core/args.js';
import { baseUrl, setDefaultWorkspace, readConfig } from '../core/config.js';
import { loadCredential, isExpired } from '../core/credentials.js';
import { whoami, resolveWorkspace } from '../core/rnc.js';
import { log } from '../core/log.js';

/**
 * rnc config set workspace <name|id>
 * rnc config get
 * Resolves the workspace against `whoami` (no slug — name-prefix or UUID).
 */
export async function configCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);
  const [action, key, ...rest] = _;

  if (action === 'get' || action === undefined) {
    const cfg = readConfig();
    log.head('rnc config');
    log.info(`base: ${base}`);
    log.info(`workspace padrão: ${cfg.defaultWorkspace ?? '(nenhum)'}`);
    return;
  }

  if (action === 'set' && key === 'workspace') {
    const needle = rest[0];
    if (!needle) {
      log.err('uso: rnc config set workspace <nome|id>');
      process.exit(1);
    }
    const cred = loadCredential(base);
    if (!cred || isExpired(cred)) {
      log.err('não autenticado — rode: rnc mcp login');
      process.exit(1);
    }
    const me = await whoami(base, cred.accessToken);
    try {
      const ws = resolveWorkspace(me, needle);
      setDefaultWorkspace(ws.id);
      log.ok(`workspace padrão: ${ws.name}  (${ws.id})`);
    } catch (e) {
      log.err((e as Error).message);
      process.exit(1);
    }
    return;
  }

  log.err(`config: uso — rnc config get | rnc config set workspace <nome|id>`);
  process.exit(1);
}
