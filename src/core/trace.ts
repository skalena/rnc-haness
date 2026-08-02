import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rncDir } from './paths.js';
import { Analysis } from './analysis.js';

/**
 * Deterministic traceability check — code ↔ spec ↔ RNC. No LLM.
 *
 * Drift signals:
 *   - a spec invariant (INV-NN) cites a BR that does not exist in the RNC IR
 *   - source code references an INV that does not exist in the spec
 *   - `[PRESUMIDO]` markers still present (block go-live)
 *   - high-impact `clarify` unknowns still unresolved
 */
export interface Finding {
  level: 'error' | 'warn' | 'info';
  msg: string;
}
export interface TraceResult {
  findings: Finding[];
  errors: number;
  warns: number;
}

const CODE_DIRS = ['src', 'app', 'server', 'backend', 'frontend', 'lib', 'domain'];
const CODE_EXT = ['.ts', '.tsx', '.js', '.java', '.cs', '.py', '.go'];
const SKIP = new Set(['node_modules', 'dist', '.next', '.rnc', '.git', 'out', 'build']);

function collectCode(cwd: string): string {
  let text = '';
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (CODE_EXT.some((e) => name.endsWith(e))) {
        try {
          text += readFileSync(p, 'utf8') + '\n';
        } catch {
          /* ignore */
        }
      }
    }
  };
  for (const d of CODE_DIRS) walk(join(cwd, d));
  return text;
}

/** Parse the INV → BR table from docs/functional/02-domain-rules.md. */
function specInvariants(cwd: string): { inv: string; br: string }[] {
  const p = join(cwd, 'docs', 'functional', '02-domain-rules.md');
  if (!existsSync(p)) return [];
  const out: { inv: string; br: string }[] = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | INV-NN | semantics | BR-... | confidence |
    if (cells[1]?.match(/^INV-\d+/i)) {
      out.push({ inv: cells[1], br: cells[3] ?? '' });
    }
  }
  return out;
}

export function trace(cwd = process.cwd()): TraceResult {
  const findings: Finding[] = [];

  // RNC IR
  const irPath = join(rncDir(cwd), 'analysis.json');
  let brSet = new Set<string>();
  let highUnknowns = 0;
  if (existsSync(irPath)) {
    const ir = Analysis.parse(JSON.parse(readFileSync(irPath, 'utf8')));
    brSet = new Set(ir.rules.map((r) => r.id));
    highUnknowns = ir.unknowns.filter((u) => u.impact === 'high').length;
  } else {
    findings.push({ level: 'warn', msg: 'sem .rnc/analysis.json — rode rnc analyze (checagem código↔RNC pulada)' });
  }

  // spec INV → BR
  const invs = specInvariants(cwd);
  if (invs.length === 0) {
    findings.push({ level: 'info', msg: 'sem invariantes na spec ainda (rode rnc spec)' });
  }
  const specInvIds = new Set(invs.map((i) => i.inv.toUpperCase()));
  for (const { inv, br } of invs) {
    if (brSet.size && br && !brSet.has(br)) {
      findings.push({ level: 'error', msg: `${inv} cita ${br}, que não existe no RNC IR (spec desatualizada?)` });
    }
  }

  // code references
  const code = collectCode(cwd);
  if (code) {
    const codeInv = new Set([...code.matchAll(/INV-\d+/gi)].map((m) => m[0].toUpperCase()));
    for (const id of codeInv) {
      if (specInvIds.size && !specInvIds.has(id)) {
        findings.push({ level: 'error', msg: `código referencia ${id}, ausente na spec (docs/functional/02-domain-rules.md)` });
      }
    }
    const presumido = (code.match(/PRESUMIDO/g) ?? []).length;
    if (presumido) findings.push({ level: 'warn', msg: `${presumido} marcador(es) [PRESUMIDO] no código — bloqueiam go-live até confirmar` });

    // domain files should cite an invariant
    const domainHasInv = /INV-\d+/i.test(code);
    if (invs.length && !domainHasInv) {
      findings.push({ level: 'warn', msg: 'nenhuma citação INV-NN no código — invariantes podem não estar aplicados/rastreados' });
    }
  } else {
    findings.push({ level: 'info', msg: 'nenhum código-fonte ainda (só spec) — checagem código↔spec pulada' });
  }

  if (highUnknowns) {
    findings.push({ level: 'warn', msg: `${highUnknowns} dúvida(s) ALTO em aberto no clarify — resolva antes do go-live` });
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  return { findings, errors, warns };
}
