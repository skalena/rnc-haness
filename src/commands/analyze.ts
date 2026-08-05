import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { ensureRncDir } from '../core/state.js';
import { Analysis, buildOrder, type Unknown } from '../core/analysis.js';
import { baseUrl, readConfig } from '../core/config.js';
import { loadCredential, isExpired, removeCredential } from '../core/credentials.js';
import { whoami, resolveWorkspace, AuthError } from '../core/rnc.js';
import { pickWorkspace } from '../core/pick.js';
import {
  withMcp,
  getWorkspaceOverview,
  listModules,
  getModule,
  getTechDebt,
  type ModuleSummary,
  type ModuleDetail,
  type WorkspaceOverview,
} from '../core/rncMcp.js';
import type { McpClient } from '../core/mcpClient.js';
import { log } from '../core/log.js';

/** In-flight module reads. Full extraction by default — losing a business
 *  rule is the exact failure this harness exists to prevent, so sampling is
 *  opt-in (--sample N), never the default.
 *
 *  Lower than the REST client used: these are JSON-RPC requests multiplexed over
 *  one SSE stream, so the win from more in flight is small and the cost of a
 *  hub module's payload is not. */
const CONCURRENCY = 4;

/**
 * Pull the legacy analysis from RNC and normalize it into the IR.
 *
 * Reads over MCP, not REST: the CLI token is `mcp`-scoped and `/api/v1/**`
 * answers 403 to it by design. Validates the workspace via whoami (which the
 * scope does allow), then reads the workspace overview + all module summaries +
 * the compiled UIR of every module carrying rules. Unresolved rules (ambiguous /
 * needs-review / incomplete) become the `clarify` gate — sourced from real RNC
 * data, not guessed.
 */
export async function analyzeCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);
  const needle = flags.workspace ? String(flags.workspace) : readConfig().defaultWorkspace ?? null;

  log.head('rnc analyze');

  const cred = loadCredential(base);
  if (!cred || isExpired(cred)) {
    log.err(`não autenticado (${base}) — rode: ${pc.cyan('rnc mcp login')}`);
    process.exit(1);
  }
  const token = cred.accessToken;

  let wsId: string;
  try {
    // --pick forces the list even when a default is set; otherwise a stored
    // default is used silently and nothing specified falls back to the list
    const ws =
      needle && !flags.pick
        ? resolveWorkspace(await whoami(base, token), needle)
        : await pickWorkspace(base, token, 'Qual workspace analisar?');
    wsId = ws.id;
    if (ws.status !== 'READY') {
      log.err(`workspace não está READY (${ws.status}) — aguarde a ingestão`);
      process.exit(1);
    }
    log.ok(`workspace '${ws.name}' · READY · ${ws.modules} módulos`);
  } catch (e) {
    if (e instanceof AuthError) {
      removeCredential(base);
      log.err(e.message);
      process.exit(1);
    }
    log.err((e as Error).message);
    process.exit(1);
  }

  let ir: Analysis;
  try {
    ir = await extract(base, token, wsId, flags.sample ? Number(flags.sample) : undefined);
  } catch (e) {
    log.err(`extração falhou: ${(e as Error).message}`);
    process.exit(1);
  }

  const dir = ensureRncDir();
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(ir, null, 2) + '\n');
  // record which workspace this project is bound to — init only had a placeholder
  const lock = join(dir, 'harness.lock');
  if (existsSync(lock)) {
    writeFileSync(lock, readFileSync(lock, 'utf8').replace(/^workspace:.*$/m, `workspace: ${wsId}`));
  }

  log.plain('');
  log.ok(`linguagem: ${ir.sourceLang}  ·  retenção: ${ir.sourceRetention}`);
  log.ok(`${ir.units.length} unidades · ${ir.rules.length} regras · ${ir.entities.length} entidades`);
  log.ok(`tech-debt: ${ir.techDebt.critical} crítico · ${ir.techDebt.high} alto · ${ir.techDebt.medium} médio · ${ir.techDebt.low} baixo`);
  log.plain('');
  log.info('ordem de build (blast-radius):');
  const top = buildOrder(ir).slice(0, 5);
  const max = Math.max(1, ...top.map((u) => u.blastRadius)); // scale to the widest, so one huge module cannot blow up the line
  for (const u of top) {
    const bar = '█'.repeat(Math.max(1, Math.round((u.blastRadius / max) * 16)));
    log.plain(`     ${bar.padEnd(17)} ${u.complexity.padEnd(6)} ${u.id}  (${u.ruleCount} regras)`);
  }
  log.plain('');
  log.ok(`salvo → .rnc/analysis.json`);
  if (ir.unknowns.length) log.warn(`${ir.unknowns.length} pontos a confirmar → rode: ${pc.cyan('rnc clarify')}`);
}

function extract(base: string, token: string, wsId: string, sample?: number): Promise<Analysis> {
  return withMcp(base, token, (mcp) => extractOverMcp(mcp, wsId, sample));
}

async function extractOverMcp(mcp: McpClient, wsId: string, sample?: number): Promise<Analysis> {
  const ws = await getWorkspaceOverview(mcp, wsId);
  log.step(`Lendo ${ws.totalModules ?? '?'} módulos…`);
  const modules = await listModules(mcp, wsId);

  // Every module carrying rules is fetched. Sampling drops business rules —
  // the one thing this pipeline must not do — so it is opt-in and reported.
  const withRules = modules.filter((m) => m.ruleCount > 0);
  const targets = sample ? [...withRules].sort((a, b) => b.ruleCount - a.ruleCount).slice(0, sample) : withRules;

  log.step(`Detalhando ${targets.length} módulos com regras (paralelismo ${CONCURRENCY})…`);
  const details: ModuleDetail[] = [];
  let fetched = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const got = await Promise.all(batch.map((m) => getModule(mcp, wsId, m.id)));
    details.push(...got);
    fetched += got.length;
    process.stdout.write(`\r  ${pc.dim(`  ${fetched}/${targets.length} módulos`)}`);
  }
  if (targets.length) process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const lang = dominantLang(ws) ?? modules[0]?.language?.toLowerCase() ?? 'unknown';
  // Server-side count when available; per-module quality findings otherwise (Java driver only, so
  // the fallback reports zero for every other language — see getTechDebt).
  const serverDebt = await getTechDebt(mcp, wsId);
  const debt = serverDebt ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const rules: Analysis['rules'] = [];
  const unknowns: Unknown[] = [];
  const entityNames = new Set<string>();
  const entities: Analysis['entities'] = [];

  // RNC numbers rules per module, so BR-001 exists in every one of them. Left
  // bare, an invariant citing "BR-001" would name fifteen different rules and
  // the provenance chain — the reason this pipeline exists — would be a guess.
  // Qualify with the module; disambiguate the rare same-named modules by id.
  const nameCount = new Map<string, number>();
  for (const d of details) nameCount.set(d.name, (nameCount.get(d.name) ?? 0) + 1);
  const qualify = (r: { id: string }, d: ModuleDetail): string =>
    (nameCount.get(d.name) ?? 0) > 1 ? `${r.id}@${d.name}#${d.id.slice(0, 6)}` : `${r.id}@${d.name}`;

  for (const d of details) {
    for (const r of d.businessRules) {
      const confidence = r.isUnambiguous && r.completeness === 'COMPLETE' && !r.requiresHumanReview ? 'high' : r.isUnambiguous === false || r.requiresHumanReview ? 'low' : 'medium';
      rules.push({ id: qualify(r, d), unit: d.name, semantics: r.description ?? r.condition ?? r.semanticKind ?? r.id, confidence });
      if (r.requiresHumanReview || r.isUnambiguous === false || (r.completeness && r.completeness !== 'COMPLETE')) {
        unknowns.push({
          ref: qualify(r, d),
          reason: 'AMBIGUOUS_RULE',
          question: r.description ?? r.condition ?? r.id,
          impact: r.severity === 'ERROR' ? 'high' : r.severity === 'WARN' ? 'medium' : 'low',
        });
      }
    }
    if (!serverDebt) {
      for (const f of d.qualityFindings) {
        const s = (f.severity ?? '').toUpperCase();
        if (s === 'CRITICAL') debt.critical++;
        else if (s === 'HIGH' || s === 'ERROR') debt.high++;
        else if (s === 'MEDIUM' || s === 'WARN') debt.medium++;
        else debt.low++;
      }
    }
    for (const dm of d.dataModels) {
      const name = dm.name ?? dm.physicalName;
      if (name && !entityNames.has(name)) {
        entityNames.add(name);
        entities.push({ name, fields: (dm.fields ?? []).map(() => ({ name: 'field' })), confidence: 'medium' });
      }
    }
    for (const ent of d.persistence?.entities ?? []) {
      if (!entityNames.has(ent)) {
        entityNames.add(ent);
        entities.push({ name: ent, fields: [], confidence: 'low' });
      }
    }
  }

  const units = modules.map((m) => ({
    id: m.name,
    kind: 'module',
    complexity: bucket(m),
    blastRadius: m.ruleCount + m.screenCount,
    ruleCount: m.ruleCount,
  }));

  const surfaces = modules
    .filter((m) => m.screenCount > 0)
    .slice(0, 20)
    .map((m, i) => ({ id: `S-${String(i + 1).padStart(2, '0')}`, kind: 'screen' as const, label: m.name }));

  if (ws.sourceRetention === 'DISCARDED') {
    unknowns.push({ ref: 'SOURCE', reason: 'DISCARDED', question: 'Fonte descartada no RNC — dúvidas de semântica não podem ser desempatadas', impact: 'high' });
  }

  // Same file ingested twice is a workspace-data problem, not ours — but it
  // double-counts rules and skews the build order, so say it out loud.
  const repeated = [...nameCount].filter(([, n]) => n > 1);
  if (repeated.length) {
    log.warn(
      `módulos com nome repetido no workspace (regras contadas mais de uma vez): ${repeated
        .map(([n, c]) => `${n} ×${c}`)
        .join(', ')}`,
    );
  }

  const skipped = withRules.length - details.length;
  if (skipped > 0) {
    log.warn(`AMOSTRADO: ${details.length}/${withRules.length} módulos com regras — ${skipped} módulo(s) NÃO extraído(s), regras perdidas`);
  } else {
    log.ok(`extração completa: ${details.length}/${withRules.length} módulos com regras (${modules.length - withRules.length} sem regras)`);
  }

  return {
    workspace: wsId,
    sourceLang: lang,
    sourceRetention: ws.sourceRetention === 'DISCARDED' ? 'DISCARDED' : 'RETAINED',
    units,
    entities,
    rules,
    surfaces,
    graph: { edges: [] },
    techDebt: debt,
    unknowns,
  };
}

function bucket(m: ModuleSummary): 'HIGH' | 'MEDIUM' | 'LOW' {
  const score = m.ruleCount + m.screenCount;
  return score >= 20 ? 'HIGH' : score >= 8 ? 'MEDIUM' : 'LOW';
}

function dominantLang(ws: WorkspaceOverview): string | null {
  const lb = ws.languageBreakdown;
  if (!lb) return null;
  const top = Object.entries(lb).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].toLowerCase() : null;
}
