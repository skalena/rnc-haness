import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { ensureRncDir } from '../core/state.js';
import { Analysis, buildOrder, type Unknown } from '../core/analysis.js';
import { baseUrl, readConfig } from '../core/config.js';
import { loadCredential, isExpired, removeCredential } from '../core/credentials.js';
import { whoami, resolveWorkspace, AuthError } from '../core/rnc.js';
import { getWorkspace, listModules, getModule, type ModuleSummary, type ModuleDetail } from '../core/rncApi.js';
import { log } from '../core/log.js';

/** How many modules to deep-fetch for rules/entities/unknowns (by ruleCount). */
const DEEP = 12;

/**
 * Pull the legacy analysis from RNC and normalize it into the IR.
 *
 * Live against the prod REST deployment: validates the workspace via whoami,
 * then reads workspace stats + all module summaries + the richest modules'
 * business rules / data models / quality findings. Unresolved rules
 * (ambiguous / needs-review / incomplete) become the `clarify` gate — sourced
 * from real RNC data, not guessed.
 */
export async function analyzeCmd(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const base = baseUrl(flags['base-url'] ? String(flags['base-url']) : undefined);
  const needle = flags.workspace ? String(flags.workspace) : readConfig().defaultWorkspace ?? null;
  if (!needle) {
    log.err('faltou --workspace <id|nome> (ou defina padrão: rnc config set workspace <nome>)');
    process.exit(1);
  }

  log.head('rnc analyze');

  const cred = loadCredential(base);
  if (!cred || isExpired(cred)) {
    log.err(`não autenticado (${base}) — rode: ${pc.cyan('rnc mcp login')}`);
    process.exit(1);
  }
  const token = cred.accessToken;

  let wsId: string;
  try {
    log.step('Validando workspace via RNC…');
    const me = await whoami(base, token);
    const ws = resolveWorkspace(me, needle);
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
    ir = await extract(base, token, wsId);
  } catch (e) {
    log.err(`extração falhou: ${(e as Error).message}`);
    process.exit(1);
  }

  const dir = ensureRncDir();
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(ir, null, 2) + '\n');

  log.plain('');
  log.ok(`linguagem: ${ir.sourceLang}  ·  retenção: ${ir.sourceRetention}`);
  log.ok(`${ir.units.length} unidades · ${ir.rules.length} regras (amostradas) · ${ir.entities.length} entidades`);
  log.ok(`tech-debt: ${ir.techDebt.critical} crítico · ${ir.techDebt.high} alto · ${ir.techDebt.medium} médio · ${ir.techDebt.low} baixo`);
  log.plain('');
  log.info('ordem de build (blast-radius):');
  for (const u of buildOrder(ir).slice(0, 5)) {
    const bar = '█'.repeat(Math.max(1, Math.round(u.blastRadius / 4)));
    log.plain(`     ${bar.padEnd(10)} ${u.complexity.padEnd(6)} ${u.id}  (${u.ruleCount} regras)`);
  }
  log.plain('');
  log.ok(`salvo → .rnc/analysis.json`);
  if (ir.unknowns.length) log.warn(`${ir.unknowns.length} pontos a confirmar → rode: ${pc.cyan('rnc clarify')}`);
}

async function extract(base: string, token: string, wsId: string): Promise<Analysis> {
  const ws = await getWorkspace(base, token, wsId);
  log.step(`Lendo ${ws.stats?.totalModules ?? '?'} módulos…`);
  const modules = await listModules(base, token, wsId);

  // deep-fetch the richest modules (by ruleCount) for rules/entities/findings
  const targets = [...modules].sort((a, b) => b.ruleCount - a.ruleCount).slice(0, DEEP);
  log.step(`Detalhando top ${targets.length} módulos por regras…`);
  const details: ModuleDetail[] = [];
  for (const m of targets) {
    if (m.ruleCount === 0) continue;
    details.push(await getModule(base, token, wsId, m.id));
  }

  const lang = dominantLang(ws) ?? modules[0]?.language?.toLowerCase() ?? 'unknown';
  const debt = { critical: 0, high: 0, medium: 0, low: 0 };
  const rules: Analysis['rules'] = [];
  const unknowns: Unknown[] = [];
  const entityNames = new Set<string>();
  const entities: Analysis['entities'] = [];

  for (const d of details) {
    for (const r of d.businessRules) {
      const confidence = r.isUnambiguous && r.completeness === 'COMPLETE' && !r.requiresHumanReview ? 'high' : r.isUnambiguous === false || r.requiresHumanReview ? 'low' : 'medium';
      rules.push({ id: r.id, unit: d.name, semantics: r.description ?? r.condition ?? r.semanticKind ?? r.id, confidence });
      if (r.requiresHumanReview || r.isUnambiguous === false || (r.completeness && r.completeness !== 'COMPLETE')) {
        unknowns.push({
          ref: r.id,
          reason: 'AMBIGUOUS_RULE',
          question: r.description ?? r.condition ?? r.id,
          impact: r.severity === 'ERROR' ? 'high' : r.severity === 'WARN' ? 'medium' : 'low',
        });
      }
    }
    for (const f of d.qualityFindings) {
      const s = (f.severity ?? '').toUpperCase();
      if (s === 'CRITICAL') debt.critical++;
      else if (s === 'HIGH' || s === 'ERROR') debt.high++;
      else if (s === 'MEDIUM' || s === 'WARN') debt.medium++;
      else debt.low++;
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

  log.warn(`regras/entidades amostradas de ${details.length}/${modules.length} módulos (top por regras) — extração completa percorre todos`);

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

function dominantLang(ws: { stats?: { languageBreakdown?: Record<string, number> } }): string | null {
  const lb = ws.stats?.languageBreakdown;
  if (!lb) return null;
  const top = Object.entries(lb).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].toLowerCase() : null;
}
