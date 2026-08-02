import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { rncDir } from '../core/paths.js';
import { Analysis } from '../core/analysis.js';
import { generateOpenApi, AGENT_MARK } from '../core/openapi.js';
import { checkOpenApi } from '../core/openapiCheck.js';
import { log } from '../core/log.js';

const API_PATH = ['docs', 'api', 'openapi.yaml'];

/**
 * rnc api gen [--force] [--limit N]   deterministic skeleton (rnc owns this)
 * rnc api check [--check]             external referee (author is not judge)
 */
export async function apiCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const sub = _[0] ?? 'check';
  switch (sub) {
    case 'gen':
      return gen(flags);
    case 'check':
      return check(flags);
    default:
      log.err(`uso: rnc api <gen|check>`);
      process.exit(1);
  }
}

function loadIr(): Analysis | null {
  const p = join(rncDir(), 'analysis.json');
  if (!existsSync(p)) return null;
  return Analysis.parse(JSON.parse(readFileSync(p, 'utf8')));
}

function gen(flags: Record<string, string | boolean>): void {
  const ir = loadIr();
  if (!ir) {
    log.err('sem análise — rode: rnc analyze --workspace <id>');
    process.exit(1);
  }
  const out = join(process.cwd(), ...API_PATH);
  if (existsSync(out) && !flags.force) {
    log.err(`${API_PATH.join('/')} já existe — use --force para regenerar (perde o enriquecimento do agente)`);
    process.exit(1);
  }

  const limit = flags.limit ? Number(flags.limit) : undefined;
  const yaml = generateOpenApi(ir, { title: `${basename(process.cwd())} API`, limit });
  mkdirSync(join(process.cwd(), 'docs', 'api'), { recursive: true });
  writeFileSync(out, yaml);

  const ops = (yaml.match(/operationId:/g) ?? []).length;
  // one marker per entity schema; the info.description mentions it once too
  const schemas = Math.max(0, (yaml.match(new RegExp(`${AGENT_MARK}:`, 'g')) ?? []).length);

  log.head('rnc api gen — esqueleto determinístico');
  log.ok(`${API_PATH.join('/')}`);
  log.ok(`${schemas} schemas de entidade · ${ops} operações CRUD · schema Error · bearerAuth`);
  log.plain('');
  log.info('o rnc é dono do esqueleto (linha de base do juiz e do trace).');
  log.info(`o agente enriquece os pontos \`${AGENT_MARK}\`: operações semânticas, shapes custom, examples reais.`);
  log.plain('');
  log.plain(`  próximo: ${pc.cyan('rnc api check')}`);
}

function check(flags: Record<string, string | boolean>): void {
  const p = join(process.cwd(), ...API_PATH);
  if (!existsSync(p)) {
    log.err(`${API_PATH.join('/')} não existe — rode: rnc api gen`);
    process.exit(1);
  }
  const findings = checkOpenApi(readFileSync(p, 'utf8'), loadIr());

  log.head('rnc api check — juiz do contrato');
  for (const f of findings) {
    if (f.level === 'error') log.err(f.msg);
    else if (f.level === 'warn') log.warn(f.msg);
    else log.info(f.msg);
  }
  const errors = findings.filter((f) => f.level === 'error').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  if (errors === 0 && warns === 0) log.ok('contrato válido');

  log.plain('');
  log.plain(`  ${errors} erro · ${warns} aviso`);
  if (flags.check && errors > 0) process.exit(1);
  if (errors > 0) process.exit(1);
}
