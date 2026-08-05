#!/usr/bin/env node
/**
 * SessionStart hook for the RNC plugin.
 *
 * Answers, before the user asks, the three things that otherwise cost a
 * round trip each: is the engine reachable, are we authenticated, and is this
 * directory already a modernization project. Silent when there is nothing
 * useful to say — a hook that always speaks becomes noise the agent ignores.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const lines = [];

/** Resolve how to invoke the CLI: global install, else npx. */
function cliInvocation() {
  try {
    execFileSync('rnc', ['--version'], { stdio: 'ignore', timeout: 5000 });
    return 'rnc';
  } catch {
    return 'npx -y @skalena/rnc';
  }
}

function authenticated() {
  const home = process.env.RNC_CONFIG_HOME ?? join(homedir(), '.rnc');
  const path = join(home, 'credentials.json');
  if (!existsSync(path)) return null;
  try {
    const store = JSON.parse(readFileSync(path, 'utf8'));
    const base = process.env.RNC_BASE_URL ?? 'https://api.rnc.skalena.co';
    const cred = store[base];
    if (!cred) return null;
    if (new Date(cred.expiresAt).getTime() <= Date.now()) return { expired: true, subject: cred.subject };
    return { expired: false, subject: cred.subject };
  } catch {
    return null;
  }
}

const cli = cliInvocation();
if (cli !== 'rnc') {
  lines.push(`O CLI \`rnc\` não está no PATH — use \`${cli}\` no lugar de \`rnc\` (não peça ao usuário para instalar nada).`);
}

const auth = authenticated();
if (!auth) {
  lines.push('RNC: sem credencial local. Se o usuário pedir algo do RNC, rode `/rnc-login` antes.');
} else if (auth.expired) {
  lines.push(`RNC: credencial de ${auth.subject} expirada — rode \`/rnc-login\`.`);
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
