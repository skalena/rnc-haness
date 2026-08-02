import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { loadStack } from '../core/state.js';
import { compose, toCompose } from '../core/composer.js';
import { log } from '../core/log.js';

/**
 * Generate the container runtime. Golden path (Next monorepo + SQLite) has no
 * docker — it prints the single-process flow. Every other combo emits a
 * docker-compose.yaml assembled from the blueprints.
 */
export async function runtimeCmd(argv: string[]): Promise<void> {
  const sub = argv[0] ?? 'up';
  const stack = loadStack();
  if (!stack) {
    log.err('nenhuma stack escolhida — rode: rnc stack');
    process.exit(1);
  }
  const c = compose(stack);

  if (stack.runtime === 'none') {
    log.head('Runtime — Golden (Next monorepo + SQLite)');
    log.info('sem docker — monorepo, 1 processo');
    log.ok('drizzle push → ./data/app.db');
    log.ok('next dev :3000');
    log.plain(`  → ${pc.cyan('http://localhost:3000')}`);
    return;
  }

  const yaml = toCompose(c);
  const out = join(process.cwd(), 'docker-compose.yaml');
  writeFileSync(out, yaml);

  log.head(`Runtime — docker-compose (${c.front.label} · ${c.back.label} · ${c.db.label})`);
  log.ok(`gerado → docker-compose.yaml`);
  log.plain('');
  log.plain(`  ${pc.dim('services')}`);
  log.plain(`  ├─ db        ${c.db.label.padEnd(14)} :${c.db.port ?? '—'}`);
  log.plain(`  ├─ backend   ${c.back.label.padEnd(14)} :${c.back.port ?? '—'}  ${c.back.health ?? ''}`);
  log.plain(`  └─ frontend  ${c.front.label.padEnd(14)} :${c.front.port ?? '—'}`);
  log.plain('');
  if (sub === 'up') {
    log.info('para subir:');
    log.plain(`     ${pc.cyan('docker compose up --wait')}`);
  }
}
