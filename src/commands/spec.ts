import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { rncDir } from '../core/paths.js';
import { Analysis, buildOrder } from '../core/analysis.js';
import { log } from '../core/log.js';

/**
 * Generate the stack-neutral functional spec from the IR. These docs are the
 * source of truth; they survive any stack change. OpenAPI (docs/api) and the
 * per-stack technical docs derive from them later.
 */
export async function specCmd(): Promise<void> {
  const p = join(rncDir(), 'analysis.json');
  if (!existsSync(p)) {
    log.err('sem análise — rode: rnc analyze --workspace <id>');
    process.exit(1);
  }
  const ir = Analysis.parse(JSON.parse(readFileSync(p, 'utf8')));
  const dir = join(process.cwd(), 'docs', 'functional');
  mkdirSync(dir, { recursive: true });

  log.head('rnc spec — docs funcionais (stack-neutras)');

  write(join(dir, '00-vision.md'), vision(ir));
  write(join(dir, '01-features.md'), features(ir));
  write(join(dir, '02-domain-rules.md'), domainRules(ir));
  write(join(dir, '03-flows.md'), flows(ir));
  write(join(dir, '06-traceability.md'), traceability(ir));

  log.plain('');
  log.info('nenhuma referência de stack aqui — de propósito');
  if (ir.unknowns.length) log.warn(`${ir.unknowns.length} pontos a confirmar → rode: ${pc.cyan('rnc clarify')}`);
}

function write(path: string, content: string): void {
  writeFileSync(path, content);
  log.ok(path.replace(process.cwd() + '/', ''));
}

function vision(ir: Analysis): string {
  return `# Visão

Modernização de sistema legado (**${ir.sourceLang}**, workspace RNC \`${ir.workspace}\`).

| Item | Valor |
|---|---|
| Linguagem legada | ${ir.sourceLang} |
| Unidades | ${ir.units.length} |
| Regras extraídas | ${ir.rules.length} |
| Retenção do fonte | \`${ir.sourceRetention}\` |
| Tech-debt | ${ir.techDebt.critical} crítico · ${ir.techDebt.high} alto · ${ir.techDebt.medium} médio |

> Derivado de \`.rnc/analysis.json\`. Onde a semântica não pôde ser confirmada, ver \`[PRESUMIDO]\` em 06-traceability.
`;
}

function features(ir: Analysis): string {
  const rows = ir.surfaces.map((s, i) => `| US-${String(i + 1).padStart(3, '0')} | ${s.label} | ${s.kind} | ${s.id} |`).join('\n');
  return `# Features & User Stories

| US | Descrição | Tipo | Surface RNC |
|---|---|---|---|
${rows}
`;
}

function domainRules(ir: Analysis): string {
  const rows = ir.rules.map((r, i) => `| INV-${String(i + 1).padStart(2, '0')} | ${r.semantics} | ${r.id} | ${r.confidence} |`).join('\n');
  return `# Invariantes de domínio

Aplicados **no servidor**, sempre. Cada um rastreável à regra de origem no legado.

| INV | Semântica | ← BR legada | Confiança |
|---|---|---|---|
${rows}
`;
}

function flows(ir: Analysis): string {
  const hasUi = ir.surfaces.some((s) => s.kind === 'screen');
  if (!hasUi) {
    return `# Fluxos

⊘ Sistema batch — sem UI. Surfaces viram jobs/endpoints.

${ir.surfaces.map((s) => `- ${s.id} — ${s.label} (${s.kind})`).join('\n')}
`;
  }
  return `# Fluxos / Telas

${ir.surfaces.map((s) => `- ${s.id} — ${s.label} (${s.kind})`).join('\n')}
`;
}

function traceability(ir: Analysis): string {
  const order = buildOrder(ir)
    .map((u) => `| ${u.id} | ${u.complexity} | ${u.ruleCount} | ${u.blastRadius} |`)
    .join('\n');
  const pend = ir.unknowns.map((u, i) => `| ${i + 1} | ${u.impact.toUpperCase()} | ${u.ref} | ${u.question} | ${u.reason} |`).join('\n');
  return `# Matriz de rastreabilidade

Workspace RNC \`${ir.workspace}\`.

## Ordem de build (blast-radius)

| Unidade | Complexidade | Regras | Blast radius |
|---|---|---|---|
${order}

## Pontos a confirmar

| # | Impacto | Ref | Questão | Motivo RNC |
|---|---|---|---|---|
${pend}
`;
}
