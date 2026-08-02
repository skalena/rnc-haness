import { hostname } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { baseUrl, setDefaultWorkspace, readConfig } from '../core/config.js';
import { saveCredential, loadCredential, removeCredential, isExpired, redact } from '../core/credentials.js';
import { startPairing, awaitApproval, whoami, PairingError, PairingUnavailable, AuthError } from '../core/rnc.js';
import { log } from '../core/log.js';

const VERSION = '0.1.0';

/** rnc mcp <login|logout|whoami|status> */
export async function mcpCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const sub = _[0] ?? 'status';
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);
  switch (sub) {
    case 'login':
      return login(base, flags);
    case 'logout':
      return logout(base);
    case 'whoami':
      return who(base);
    case 'status':
      return status(base);
    case 'token':
      return printToken(base);
    default:
      log.err(`subcomando desconhecido: mcp ${sub}  (login|logout|whoami|status|token)`);
      process.exit(1);
  }
}

async function login(base: string, flags: Record<string, string | boolean>): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' Login RNC ')));

  // Explicit token path: --token (or RNC_TOKEN). Also the automatic fallback
  // when the deployment does not expose device pairing.
  const flagToken = typeof flags.token === 'string' ? flags.token : undefined;
  if (flagToken || process.env.RNC_TOKEN) {
    return loginWithToken(base, flagToken ?? process.env.RNC_TOKEN!);
  }

  let pairing;
  try {
    pairing = await startPairing(base, `RNC-Harness ${VERSION} (${hostname()})`);
  } catch (e) {
    if (e instanceof PairingUnavailable) {
      p.log.warn(`${base} não expõe device pairing (/auth/cli/pair → 404).`);
      p.note(
        `Gere um token no web app (Settings → MCP Access) e cole abaixo.\nO token não aparece na tela nem no histórico do shell.`,
        'Autenticação por token',
      );
      const pasted = await p.password({
        message: 'Token RNC',
        validate: (v) => (v && v.length > 20 ? undefined : 'token muito curto'),
      });
      if (p.isCancel(pasted)) {
        p.cancel('cancelado');
        process.exit(0);
      }
      return loginWithToken(base, String(pasted).trim());
    }
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

/**
 * Authenticate with a token issued by the web app. This is the working path on
 * deployments without device pairing. The token is validated against the API
 * before being stored — a bad token fails here, not three commands later.
 */
async function loginWithToken(base: string, token: string): Promise<void> {
  const s = p.spinner();
  s.start('validando token…');
  let me;
  try {
    me = await whoami(base, token);
  } catch (e) {
    s.stop(pc.red('token inválido'));
    p.cancel(`${(e as Error).message}  (base: ${base})`);
    process.exit(1);
  }
  s.stop(`autenticado como ${me.subject}`);

  saveCredential({
    baseUrl: base,
    accessToken: token,
    expiresAt: jwtExpiry(token) ?? new Date(Date.now() + 90 * 864e5).toISOString(),
    subject: me.subject,
    clientName: `RNC-Harness ${VERSION} (${hostname()})`,
  });

  p.log.success(`token salvo (0600) · workspaces: ${me.workspaces.map((w) => w.name).join(', ') || '(nenhum)'}`);
  const preferred = me.workspaces[0];
  if (preferred) {
    setDefaultWorkspace(preferred.id);
    p.outro(`padrão: ${preferred.name}  ·  mudar: ${pc.cyan('rnc config set workspace <nome>')}`);
  } else {
    p.outro('nenhum workspace visível para este tenant');
  }
}

/** Read `exp` from a JWT without verifying it — display only, token stays opaque. */
function jwtExpiry(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: number };
    return payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
  } catch {
    return null;
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

/**
 * Print the raw token to stdout so it can be piped into an env var or an agent
 * config (`export RNC_TOKEN=$(rnc mcp token)`), the way `gh auth token` works.
 * Nothing else is written to stdout, so the output is safe to capture.
 */
function printToken(base: string): void {
  const cred = loadCredential(base);
  // errors go to stderr so a captured stdout is either the token or empty
  if (!cred) {
    process.stderr.write(`não autenticado (${base}) — rode: rnc mcp login\n`);
    process.exit(1);
  }
  if (isExpired(cred)) {
    process.stderr.write('token expirado — rode: rnc mcp login\n');
    process.exit(1);
  }
  process.stdout.write(cred.accessToken + '\n');
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
