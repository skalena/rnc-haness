import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { pkgRoot } from '../core/paths.js';
import { log } from '../core/log.js';

/**
 * rnc install [--global]
 *
 * Copies the skills shipped with this package into the agent's skills
 * directory, so the conversational front door works without a network round
 * trip. `npx skills add skalena/rnc-haness` does the same across 70+ agents;
 * this is the zero-dependency path for someone who already has the CLI.
 */
export async function installCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const src = join(pkgRoot, 'skills');
  if (!existsSync(src)) {
    log.err(`skills não encontradas no pacote (${src})`);
    process.exit(1);
  }

  const dest = flags.global ? join(homedir(), '.claude', 'skills') : join(process.cwd(), '.claude', 'skills');

  log.head('rnc install — skills do Claude Code');
  log.info(flags.global ? 'escopo: global (~/.claude/skills)' : 'escopo: este projeto (.claude/skills)');
  log.plain('');

  let n = 0;
  for (const name of readdirSync(src)) {
    const skillDir = join(src, name);
    if (!statSync(skillDir).isDirectory()) continue;
    const target = join(dest, name);
    mkdirSync(target, { recursive: true });
    for (const file of readdirSync(skillDir)) {
      copyFileSync(join(skillDir, file), join(target, file));
    }
    log.ok(`${name}`);
    n++;
  }

  log.plain('');
  log.ok(`${n} skills instaladas em ${dest.replace(homedir(), '~')}`);
  log.plain('');
  log.plain('  use assim:');
  log.plain(`    ${pc.cyan('claude')}`);
  log.plain(`    ${pc.dim('> moderniza meu legado')}`);
  log.plain('');
  log.info('para o MCP do RNC no agente: export RNC_TOKEN=$(rnc mcp token)');
}
