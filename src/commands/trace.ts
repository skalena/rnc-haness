import { parseFlags } from '../core/args.js';
import { trace } from '../core/trace.js';
import { log } from '../core/log.js';

/**
 * rnc trace [--check]
 * Reports traceability drift (code ↔ spec ↔ RNC). With --check, exits 1 on any
 * error — wire it into CI to fail the build on drift.
 */
export async function traceCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { findings, errors, warns } = trace();

  log.head('rnc trace — código ↔ spec ↔ RNC');
  for (const f of findings) {
    if (f.level === 'error') log.err(f.msg);
    else if (f.level === 'warn') log.warn(f.msg);
    else log.info(f.msg);
  }
  if (errors === 0 && warns === 0) log.ok('sem drift');

  log.plain('');
  log.plain(`  ${errors} erro · ${warns} aviso`);

  if (flags.check && errors > 0) process.exit(1);
}
