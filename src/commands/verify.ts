import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { rncDir } from '../core/paths.js';
import { Analysis } from '../core/analysis.js';
import { loadStack, loadProgress } from '../core/state.js';
import { milestones } from '../core/roadmap.js';
import { trace } from '../core/trace.js';
import { log } from '../core/log.js';

/**
 * rnc verify
 * Runs the generated project's own quality gates (the scripts it declares) plus
 * the deterministic traceability check, and echoes the current milestone's
 * Definition of Done. Exits 1 if any gate fails or trace finds drift.
 */
export async function verifyCmd(): Promise<void> {
  log.head('rnc verify');
  let failed = 0;

  // 1. project quality gates (npm scripts, if this is a JS/monorepo project)
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    const scripts = (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}) as Record<string, string>;
    const gates = ['typecheck', 'lint', 'test', 'build'].filter((g) => scripts[g]);
    if (gates.length === 0) log.info('package.json sem scripts de qualidade (typecheck/lint/test/build)');
    for (const g of gates) {
      process.stdout.write(`  ${pc.dim('▶')} npm run ${g} … `);
      const res = spawnSync('npm', ['run', '--silent', g], { stdio: ['ignore', 'ignore', 'ignore'] });
      if (res.status === 0) console.log(pc.green('✔'));
      else {
        console.log(pc.red('✖'));
        failed++;
      }
    }
  } else {
    log.info('sem package.json aqui — gates por-stack (backend/frontend) rodam no container: docker compose run');
  }

  // 2. traceability
  log.plain('');
  const t = trace();
  for (const f of t.findings) {
    if (f.level === 'error') log.err(f.msg);
    else if (f.level === 'warn') log.warn(f.msg);
  }
  if (t.errors === 0) log.ok('trace: sem drift');
  else failed += t.errors;

  // 3. Definition of Done for the current milestone (informational)
  const irPath = join(rncDir(), 'analysis.json');
  const stack = loadStack();
  if (existsSync(irPath) && stack) {
    const ir = Analysis.parse(JSON.parse(readFileSync(irPath, 'utf8')));
    const done = loadProgress();
    const current = milestones(ir, stack).find((m) => !done.includes(m.id)) ?? milestones(ir, stack).at(-1);
    if (current) {
      log.plain('');
      log.info(`Definition of Done — ${current.id} ${current.title}:`);
      for (const d of current.dod) log.plain(`     ${pc.dim('•')} ${d}`);
    }
  }

  log.plain('');
  if (failed > 0) {
    log.err(`${failed} falha(s) — corrija antes de marcar o milestone pronto`);
    process.exit(1);
  }
  log.ok('verify passou');
}
