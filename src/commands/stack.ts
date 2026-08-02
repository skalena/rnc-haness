import pc from 'picocolors';
import * as p from '@clack/prompts';
import { byKind } from '../core/blueprints.js';
import { compose, ComposeError } from '../core/composer.js';
import { saveStack } from '../core/state.js';
import { parseFlags } from '../core/args.js';
import { log } from '../core/log.js';

/**
 * Choose the target architecture. The SDD spec is stack-neutral; this is the
 * one phase that binds it to a concrete stack. Non-interactive via flags:
 *   rnc stack --front vue --back quarkus --db postgres
 *   rnc stack --golden
 */
export async function stackCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);

  let sel: { frontend: string; backend: string; database: string };

  if (flags.golden) {
    sel = { frontend: 'next', backend: 'next-api', database: 'sqlite' };
  } else if (flags.front || flags.back || flags.db) {
    sel = {
      frontend: String(flags.front ?? 'next'),
      backend: String(flags.back ?? 'next-api'),
      database: String(flags.db ?? 'sqlite'),
    };
  } else {
    sel = await interactive();
  }

  try {
    const c = compose(sel);
    saveStack(c.stack);
    log.head('Arquitetura alvo');
    log.ok(`frontend  ${pc.bold(c.front.label)}`);
    log.ok(`backend   ${pc.bold(c.back.label)}`);
    log.ok(`database  ${pc.bold(c.db.label)}`);
    log.ok(`runtime   ${c.stack.runtime === 'none' ? pc.green('golden — sem docker') : 'docker-compose'}`);
    for (const w of c.warnings) log.warn(w);
    log.plain('');
    log.info('testabilidade (fixa):');
    log.plain(`     front  ${fmt(c.front.test)}`);
    log.plain(`     back   ${fmt(c.back.test)}`);
    log.plain(`     seam   contract-test do OpenAPI`);
    log.plain('');
    log.ok(`salvo → .rnc/stack.json`);
    log.plain('');
    log.plain(`  próximo:  ${pc.cyan('rnc runtime up')}`);
  } catch (e) {
    if (e instanceof ComposeError) {
      log.err(e.message);
      process.exit(1);
    }
    throw e;
  }
}

function fmt(test: Record<string, string>): string {
  return Object.entries(test)
    .map(([k, v]) => `${k}:${v}`)
    .join(' · ');
}

async function interactive(): Promise<{ frontend: string; backend: string; database: string }> {
  p.intro(pc.bgCyan(pc.black(' rnc stack ')));

  const shortcut = await p.confirm({
    message: 'Usar Golden path (Next.js monorepo + SQLite, sem docker)?',
    initialValue: false,
  });
  if (p.isCancel(shortcut)) process.exit(0);
  if (shortcut) {
    p.outro('golden selecionado');
    return { frontend: 'next', backend: 'next-api', database: 'sqlite' };
  }

  const frontend = await p.select({
    message: 'Frontend',
    options: byKind('frontend').map((b) => ({ value: b.id, label: b.label })),
  });
  const backend = await p.select({
    message: 'Backend',
    options: byKind('backend').map((b) => ({ value: b.id, label: b.label })),
  });
  const database = await p.select({
    message: 'Database',
    options: byKind('database').map((b) => ({ value: b.id, label: b.label })),
  });
  if (p.isCancel(frontend) || p.isCancel(backend) || p.isCancel(database)) process.exit(0);
  p.outro('combo selecionado');
  return { frontend: frontend as string, backend: backend as string, database: database as string };
}
