import { hostname } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { baseUrl, setDefaultWorkspace, readConfig } from '../core/config.js';
import { saveCredential, loadCredential, removeCredential, isExpired, redact } from '../core/credentials.js';
import { startPairing, awaitApproval, whoami, PairingError, AuthError } from '../core/rnc.js';
import { log } from '../core/log.js';

const VERSION = '0.1.0';

/** rnc mcp <login|logout|whoami|status> */
export async function mcpCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const sub = _[0] ?? 'status';
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);
  switch (sub) {
    case 'login':
      return login(base);
    case 'logout':
      return logout(base);
    case 'whoami':
      return who(base);
    case 'status':
      return status(base);
    default:
      log.err(`subcomando desconhecido: mcp ${sub}  (login|logout|whoami|status)`);
      process.exit(1);
  }
}

async function login(base: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' Login RNC ')));

  let pairing;
  try {
    pairing = await startPairing(base, `RNC-Harness ${VERSION} (${hostname()})`);
  } catch (e) {
    p.cancel(`falha ao iniciar pairing: ${(e as Error).message}  (base: ${base})`);
    process.exit(1);
  }

  p.note(
    `${pc.underline(pairing.verificationUriComplete)}\n\ncódigo:  ${pc.bold(pairing.userCode)}`,
    'Abra no navegador e informe o código',
  );

  const s = p.spinner();
  s.start('aguardando autorização…');
  try {
    const grant = await awaitApproval(base, pairing.deviceCode, pairing.interval, pairing.expiresIn);
    s.stop(`autenticado como ${grant.subject}`);

    saveCredential({
      baseUrl: base,
      accessToken: grant.accessToken,
      expiresAt: grant.expiresAt,
      subject: grant.subject,
      clientName: `RNC-Harness ${VERSION} (${hostname()})`,
    });

    const me = await whoami(base, grant.accessToken);
    p.log.success(`token salvo (0600) · workspaces: ${me.workspaces.map((w) => w.name).join(', ') || '(nenhum)'}`);

    const preferred = me.workspaces[0];
    if (preferred) {
      setDefaultWorkspace(preferred.id);
      p.outro(`padrão: ${preferred.name}  ·  mudar: ${pc.cyan('rnc config set workspace <nome>')}`);
    } else {
      p.outro('nenhum workspace visível para este tenant');
    }
  } catch (e) {
    if (e instanceof PairingError) {
      const msg =
        e.code === 'access_denied'
          ? 'acesso negado no navegador'
          : e.code === 'timeout'
            ? 'janela de 10 min expirou'
            : 'device code expirado/usado — rode login de novo';
      s.stop(pc.red(msg));
      process.exit(1);
    }
    s.stop(pc.red(`erro: ${(e as Error).message}`));
    process.exit(1);
  }
}

function logout(base: string): void {
  const removed = removeCredential(base);
  log.head('rnc mcp logout');
  if (removed) log.ok(`credencial local removida (${base})`);
  else log.info(`nenhuma credencial local para ${base}`);
  log.warn('o token continua VÁLIDO no servidor — isto só esquece localmente');
  log.plain(`  revogar de verdade: web app → ${pc.bold('Settings → MCP Access → Connected clients')}`);
}

async function who(base: string): Promise<void> {
  const cred = requireCred(base);
  try {
    const me = await whoami(base, cred.accessToken);
    log.head(`whoami — ${me.subject}`);
    log.ok(`tenant ${me.tenantId ?? '—'} · role ${me.role ?? '—'}${me.platformAdmin ? ' · platformAdmin' : ''}`);
    log.plain('');
    log.info(`workspaces (${me.workspaces.length}):`);
    const def = readConfig().defaultWorkspace;
    for (const w of me.workspaces) {
      const mark = w.id === def ? pc.green(' ★') : '  ';
      log.plain(`   ${mark} ${w.name.padEnd(18)} ${pc.dim(w.status.padEnd(7))} ${w.modules} módulos  ${pc.dim(w.id)}`);
    }
  } catch (e) {
    handleAuthError(e, base);
  }
}

async function status(base: string): Promise<void> {
  log.head('rnc mcp status');
  const cred = loadCredential(base);
  if (!cred) {
    log.info(`não autenticado (${base}) — rode: ${pc.cyan('rnc mcp login')}`);
    return;
  }
  log.ok(`credencial: ${cred.subject}  (token ${redact(cred.accessToken)})`);
  log.plain(`     base ${base}`);
  if (isExpired(cred)) {
    log.err(`expirada em ${cred.expiresAt} — rode: rnc mcp login`);
    process.exit(1);
  }
  log.ok(`válida até ${cred.expiresAt}`);
  const def = readConfig().defaultWorkspace;
  if (def) log.info(`workspace padrão: ${def}`);
}

function requireCred(base: string) {
  const cred = loadCredential(base);
  if (!cred) {
    log.err(`não autenticado (${base}) — rode: rnc mcp login`);
    process.exit(1);
  }
  if (isExpired(cred)) {
    log.err('token expirado — rode: rnc mcp login');
    process.exit(1);
  }
  return cred;
}

function handleAuthError(e: unknown, base: string): never {
  if (e instanceof AuthError) {
    removeCredential(base); // 401 → discard, §6
    log.err(`${e.message}`);
    process.exit(1);
  }
  log.err(`${(e as Error).message}`);
  process.exit(1);
}
