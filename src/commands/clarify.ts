import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { rncDir } from '../core/paths.js';
import { Analysis } from '../core/analysis.js';
import { log } from '../core/log.js';

/**
 * The clarify gate. Surfaces every unknown RNC could not resolve automatically
 * (AMBIGUOUS_RULE, DISCARDED source, low-confidence binding, missing schema).
 * High-impact unknowns BLOCK implementation until answered or marked PRESUMIDO.
 */
export async function clarifyCmd(): Promise<void> {
  const p = join(rncDir(), 'analysis.json');
  if (!existsSync(p)) {
    log.err('sem análise — rode: rnc analyze --workspace <id>');
    process.exit(1);
  }
  const ir = Analysis.parse(JSON.parse(readFileSync(p, 'utf8')));

  log.head(`Pontos a confirmar (${ir.unknowns.length})`);
  const blocking = ir.unknowns.filter((u) => u.impact === 'high');

  ir.unknowns.forEach((u, i) => {
    const tag = u.impact === 'high' ? pc.red('ALTO') : u.impact === 'medium' ? pc.yellow('MÉDIO') : pc.dim('BAIXO');
    log.plain('');
    log.plain(`  [${i + 1}/${ir.unknowns.length}] ${tag} · ${pc.bold(u.ref)}  ${pc.dim(`(${u.reason})`)}`);
    log.plain(`  │ ${u.question}`);
    log.plain(`  › ${pc.dim('○ responder  ● marcar [PRESUMIDO]  ○ re-ingerir no RNC com retenção')}`);
  });

  log.plain('');
  if (blocking.length) {
    log.warn(`${blocking.length} bloqueiam \`rnc implement\` até resolver`);
    log.info('interativo (responder/PRESUMIDO) chega na próxima iteração — gate é o design central');
  } else {
    log.ok('nada bloqueando — pode seguir para rnc stack / implement');
  }
}
