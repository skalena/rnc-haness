#!/usr/bin/env node
/**
 * SessionStart hook for the RNC plugin.
 *
 * Two jobs:
 *
 * 1. Make the plugin's configuration the single source of truth. The MCP server
 *    reads the token straight from plugin config, but the `rnc` CLI reads its
 *    own credential store — without this, the user would configure the same
 *    token twice. The token arrives here as CLAUDE_PLUGIN_OPTION_TOKEN (env,
 *    because shell-form hook commands reject ${user_config.*} substitution).
 *
 * 2. Tell the agent, up front, what would otherwise cost a round trip each:
 *    whether the engine is reachable, whether we are authenticated, and whether
 *    this directory is already a modernization project. Silent when there is
 *    nothing useful to say — a hook that always speaks becomes noise.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const lines = [];

const BASE = process.env.CLAUDE_PLUGIN_OPTION_BASE_URL || process.env.RNC_BASE_URL || 'https://api.rnc.skalena.co';
const HOME = process.env.RNC_CONFIG_HOME ?? join(homedir(), '.rnc');
const CRED = join(HOME, 'credentials.json');

/** Claims we can read without verifying — the token stays opaque to us. */
function claims(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function readStore() {
  if (!existsSync(CRED)) return {};
  try {
    return JSON.parse(readFileSync(CRED, 'utf8'));
  } catch {
    return {};
  }
}

/** Mirror the plugin's configured token into the CLI's credential store. */
function syncToken() {
  const token = process.env.CLAUDE_PLUGIN_OPTION_TOKEN;
  if (!token) return;
  const store = readStore();
  if (store[BASE]?.accessToken === token) return; // already in sync

  const c = claims(token);
  store[BASE] = {
    baseUrl: BASE,
    accessToken: token,
    expiresAt: c.exp ? new Date(c.exp * 1000).toISOString() : new Date(Date.now() + 90 * 864e5).toISOString(),
    subject: c.sub ?? 'plugin-config',
    clientName: 'RNC plugin (Claude Code)',
  };
  try {
    mkdirSync(HOME, { recursive: true, mode: 0o700 });
    writeFileSync(CRED, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
    lines.push('RNC: token do plugin sincronizado com o CLI — `rnc` e as tools MCP usam a mesma credencial.');
  } catch (e) {
    lines.push(`RNC: não consegui gravar a credencial do CLI (${e.message}); as tools MCP funcionam, os comandos \`rnc\` não.`);
  }
}

function credential() {
  const cred = readStore()[BASE];
  if (!cred) return null;
  return { expired: new Date(cred.expiresAt).getTime() <= Date.now(), subject: cred.subject };
}

syncToken();

// how to invoke the engine
try {
  execFileSync('rnc', ['--version'], { stdio: 'ignore', timeout: 5000 });
} catch {
  lines.push('O CLI `rnc` não está no PATH — use `npx -y @skalena/rnc` no lugar de `rnc` (não peça ao usuário para instalar nada).');
}

const auth = credential();
if (!auth) {
  lines.push('RNC: sem credencial. Configure o token do plugin com `/plugin` (entrada mascarada, vai para o Keychain) ou rode `/rnc-login`.');
} else if (auth.expired) {
  lines.push(`RNC: credencial de ${auth.subject} expirada — reconfigure o token em \`/plugin\`.`);
} else {
  lines.push(`RNC: autenticado como ${auth.subject}.`);
}

// project state — only worth mentioning inside an existing harness project
const irPath = join(process.cwd(), '.rnc', 'analysis.json');
if (existsSync(irPath)) {
  try {
    const ir = JSON.parse(readFileSync(irPath, 'utf8'));
    const blocking = (ir.unknowns ?? []).filter((u) => u.impact === 'high').length;
    lines.push(
      `Projeto RNC neste diretório: legado ${ir.sourceLang}, ${ir.units?.length ?? 0} unidades, ${ir.rules?.length ?? 0} regras.` +
        (blocking ? ` ${blocking} ponto(s) de impacto ALTO em aberto no clarify — bloqueiam geração de domínio.` : ''),
    );
  } catch {
    /* a malformed IR is not this hook's problem to report */
  }
}

if (lines.length) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `[RNC harness]\n${lines.join('\n')}`,
      },
    }),
  );
}
