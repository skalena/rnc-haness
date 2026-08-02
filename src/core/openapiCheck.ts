import { parse } from 'yaml';
import type { Analysis } from './analysis.js';
import type { Finding } from './trace.js';
import { AGENT_MARK } from './openapi.js';

/**
 * The referee for the API contract. Deterministic, external to whoever wrote
 * the file — the agent may enrich the contract, but it does not get to decide
 * whether the result is valid.
 */
export function checkOpenApi(raw: string, ir: Analysis | null): Finding[] {
  const findings: Finding[] = [];

  let doc: Record<string, unknown>;
  try {
    doc = parse(raw) as Record<string, unknown>;
  } catch (e) {
    return [{ level: 'error', msg: `openapi.yaml não parseia: ${(e as Error).message}` }];
  }
  if (!doc || typeof doc !== 'object') return [{ level: 'error', msg: 'openapi.yaml vazio ou inválido' }];

  // well-formed
  if (!doc.openapi) findings.push({ level: 'error', msg: 'falta a chave `openapi` (versão)' });
  if (!doc.paths || typeof doc.paths !== 'object') findings.push({ level: 'error', msg: 'falta `paths`' });

  const components = (doc.components ?? {}) as Record<string, unknown>;
  const schemas = (components.schemas ?? {}) as Record<string, unknown>;
  const schemaNames = new Set(Object.keys(schemas));

  // security must exist — fail-closed is a guardrail, not a suggestion
  if (!doc.security && !components.securitySchemes) {
    findings.push({ level: 'error', msg: 'sem `security`/`securitySchemes` — endpoints devem ser fail-closed' });
  }

  // error schema present
  if (!schemaNames.has('Error')) {
    findings.push({ level: 'error', msg: 'falta o schema `Error` (contrato de erro do domínio)' });
  }

  const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
  const opIds = new Set<string>();
  const refs = new Set<string>();
  let opCount = 0;

  for (const [p, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      opCount++;
      const o = op as Record<string, unknown>;
      const id = o.operationId as string | undefined;
      if (!id) findings.push({ level: 'error', msg: `${method.toUpperCase()} ${p} sem operationId` });
      else if (opIds.has(id)) findings.push({ level: 'error', msg: `operationId duplicado: ${id}` });
      else opIds.add(id);

      const responses = (o.responses ?? {}) as Record<string, unknown>;
      if (Object.keys(responses).length === 0) {
        findings.push({ level: 'error', msg: `${method.toUpperCase()} ${p} sem responses` });
      }
      // every mutating operation must declare an auth failure path
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        const hasAuthFail = Object.keys(responses).some((c) => c === '401' || c === '403');
        if (!hasAuthFail) {
          findings.push({ level: 'warn', msg: `${method.toUpperCase()} ${p} não declara 401/403 (fail-closed)` });
        }
      }
    }
  }

  // collect $refs, verify they resolve
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === '$ref' && typeof val === 'string') refs.add(val);
        else walk(val);
      }
    }
  };
  walk(doc.paths);
  walk(schemas);
  for (const ref of refs) {
    const m = ref.match(/^#\/components\/(schemas|responses)\/(.+)$/);
    if (!m) {
      findings.push({ level: 'error', msg: `$ref não suportado/externo: ${ref}` });
      continue;
    }
    const bucket = (components[m[1]!] ?? {}) as Record<string, unknown>;
    if (!(m[2]! in bucket)) findings.push({ level: 'error', msg: `$ref quebrado: ${ref}` });
  }

  // orphan schemas — declared but never used
  for (const name of schemaNames) {
    if (name === 'Error') continue;
    if (!refs.has(`#/components/schemas/${name}`)) {
      findings.push({ level: 'warn', msg: `schema órfão (nunca referenciado): ${name}` });
    }
  }

  // money must never be a float — the legacy's root cause of cent drift
  for (const [name, s] of Object.entries(schemas)) {
    const props = ((s as Record<string, unknown>).properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [field, def] of Object.entries(props)) {
      if (/price|amount|total|valor|preco|cost|tax|discount/i.test(field) && def.type === 'number') {
        findings.push({ level: 'error', msg: `${name}.${field} é number — dinheiro nunca em float (use decimal string)` });
      }
    }
  }

  // contract vs RNC IR
  if (ir) {
    const known = new Set(ir.entities.map((e) => e.name.replace(/[^A-Za-z0-9]/g, '').toLowerCase()));
    for (const name of schemaNames) {
      if (name === 'Error') continue;
      if (known.size && !known.has(name.replace(/[^A-Za-z0-9]/g, '').toLowerCase())) {
        findings.push({ level: 'warn', msg: `schema ${name} não corresponde a nenhuma entidade do IR RNC` });
      }
    }
  }

  // agent-fill markers still pending
  const pending = (raw.match(new RegExp(AGENT_MARK, 'g')) ?? []).length;
  if (pending) {
    findings.push({
      level: 'warn',
      msg: `${pending} ponto(s) \`${AGENT_MARK}\` ainda por enriquecer (operações semânticas/exemplos são do agente)`,
    });
  }

  // examples are the contract-test fixtures — flag their absence
  if (opCount > 0 && !raw.includes('example')) {
    findings.push({ level: 'warn', msg: 'nenhum `example` no contrato — eles são as fixtures do contract-test' });
  }

  return findings;
}
