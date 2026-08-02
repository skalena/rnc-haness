import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBlueprints, byKind } from '../core/blueprints.js';
import { loadStack } from '../core/state.js';
import { rncDir } from '../core/paths.js';
import { baseUrl } from '../core/config.js';
import { loadCredential, isExpired } from '../core/credentials.js';
import { log } from '../core/log.js';

/** Diagnose the harness install and the current project state. */
export async function doctorCmd(): Promise<void> {
  log.head('rnc doctor');
  let errors = 0;
  let warns = 0;

  // node
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) log.ok(`node ${process.versions.node}`);
  else {
    log.err(`node ${process.versions.node} — requer ≥ 20.12`);
    errors++;
  }

  // blueprints load + compose integrity
  try {
    const all = loadBlueprints();
    log.ok(
      `blueprints ok — ${byKind('frontend').length} front · ${byKind('backend').length} back · ${byKind('database').length} db`,
    );
    // persistence coverage report
    for (const b of byKind('backend')) {
      if (b.id === 'next-api') continue;
      const dbs = byKind('database').filter((d) => d.id !== 'sqlite').map((d) => d.id);
      const missing = dbs.filter((d) => !(b.persistence ?? []).includes(d));
      if (missing.length) {
        log.warn(`${b.label}: sem adapter persistence p/ ${missing.join(', ')}`);
        warns++;
      }
    }
    void all;
  } catch (e) {
    log.err(`blueprints inválidos: ${(e as Error).message}`);
    errors++;
  }

  // RNC auth
  const base = baseUrl();
  const cred = loadCredential(base);
  if (!cred) log.info(`RNC: não autenticado (${base}) — rnc mcp login`);
  else if (isExpired(cred)) {
    log.warn(`RNC: token expirado (${cred.subject}) — rnc mcp login`);
    warns++;
  } else log.ok(`RNC: autenticado como ${cred.subject} (${base})`);

  // project state
  const dir = rncDir();
  if (existsSync(dir)) {
    log.ok(`.rnc/ presente`);
    const stack = loadStack();
    if (stack) log.ok(`stack: ${stack.frontend} · ${stack.backend} · ${stack.database} (${stack.runtime})`);
    else log.info(`stack não escolhida — rode: rnc stack`);
    if (existsSync(join(dir, 'analysis.json'))) log.ok(`analysis.json presente`);
    else log.info(`sem analysis — rode: rnc analyze --workspace <id>`);
  } else {
    log.info(`projeto não inicializado — rode: rnc init`);
  }

  // agent tool detection
  log.plain('');
  log.info('ferramentas de agente:');
  detectTool('Claude Code', existsSync(join(process.cwd(), '.mcp.json')) || existsSync(join(process.cwd(), 'CLAUDE.md')));
  detectTool('AGENTS.md (Codex/OpenCode/Bob)', existsSync(join(process.cwd(), 'AGENTS.md')));

  log.plain('');
  const summary = `${errors === 0 ? pc.green('0 erro') : pc.red(`${errors} erro`)} · ${warns} aviso`;
  log.plain(`  ${summary}`);
  if (errors) process.exit(1);
}

function detectTool(name: string, present: boolean): void {
  console.log(`     ${present ? pc.green('✔') : pc.dim('—')} ${name}`);
}
