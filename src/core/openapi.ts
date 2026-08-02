import type { Analysis } from './analysis.js';

/**
 * Deterministic OpenAPI skeleton generation + validation.
 *
 * WHY THIS IS NOT LEFT TO THE AGENT: openapi.yaml is THE contract — the
 * frontend client, backend stubs, contract tests, mocks and docs all derive
 * from it. An LLM does not emit the same file twice, so if each session
 * rewrote it, the two sides would be built against different contracts and
 * `rnc trace` would lose its baseline.
 *
 * The split:
 *   - rnc owns the mechanical transform (entity -> schema, ErrorCode -> error
 *     schema, surfaces -> CRUD paths) and owns the file's identity.
 *   - the agent enriches the semantic middle (custom operations, request /
 *     response shapes, meaningful examples) INSIDE that skeleton.
 *   - `rnc api check` is the external referee: the author is never the judge.
 */

/** Marker that tells the agent (and `check`) which parts are its to fill. */
export const AGENT_MARK = 'x-rnc-agent-fill';

const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'INSUFFICIENT_STOCK',
  'INTERNAL',
];

/** Legacy type -> OpenAPI schema. Money never becomes a float. */
function fieldSchema(name: string, rawType?: string): Record<string, unknown> {
  const t = (rawType ?? '').toLowerCase();
  const n = name.toLowerCase();
  const isMoney = /price|amount|total|valor|preco|salario|cost|tax|discount/.test(n);
  if (isMoney) {
    // guardrail: money is a decimal string, never a float
    return { type: 'string', pattern: '^-?\\d+(\\.\\d{1,2})?$', description: 'decimal (2 casas) — nunca float' };
  }
  if (/date|data|timestamp|created|updated/.test(n) || /date|time/.test(t)) {
    return { type: 'string', format: 'date-time' };
  }
  if (/^(int|integer|long|bigint|number|numeric|smallint)/.test(t)) return { type: 'integer' };
  if (/^(bool|boolean)/.test(t)) return { type: 'boolean' };
  if (/^(uuid)/.test(t)) return { type: 'string', format: 'uuid' };
  return { type: 'string' };
}

/** camelCase a legacy entity name: CHAMADA_INSP -> ChamadaInsp. */
function schemaName(raw: string): string {
  return raw
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => (p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

/** kebab plural path segment: ChamadaInsp -> chamada-insps. */
function pathName(schema: string): string {
  const kebab = schema.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return kebab.endsWith('s') ? kebab : `${kebab}s`;
}

/** Deduplicate logical/physical duplicates (Atribuicao + ATRIBUICAO). */
function dedupeEntities(ir: Analysis): Analysis['entities'] {
  const byKey = new Map<string, Analysis['entities'][number]>();
  for (const e of ir.entities) {
    const key = schemaName(e.name).toLowerCase();
    const existing = byKey.get(key);
    // prefer the richer definition (more fields), then the logical name
    if (!existing || e.fields.length > existing.fields.length) byKey.set(key, e);
  }
  return [...byKey.values()];
}

export interface GenOptions {
  title: string;
  /** Cap on generated resources, so a 600-entity legacy does not explode. */
  limit?: number;
}

/** Build the deterministic OpenAPI 3.1 skeleton. Same IR in -> same file out. */
export function generateOpenApi(ir: Analysis, opts: GenOptions): string {
  const entities = dedupeEntities(ir).slice(0, opts.limit ?? 40);

  const schemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};

  for (const e of entities) {
    const name = schemaName(e.name);
    if (!name) continue;
    const props: Record<string, unknown> = { id: { type: 'string', format: 'uuid', readOnly: true } };
    for (const f of e.fields) {
      if (!f.name || f.name === 'field') continue;
      props[f.name] = fieldSchema(f.name, f.type);
    }
    schemas[name] = {
      type: 'object',
      description: `Entidade derivada do legado (${e.name}, confiança RNC: ${e.confidence}).`,
      properties: props,
      [AGENT_MARK]: 'confirme campos/obrigatoriedade contra as INV em docs/functional/02-domain-rules.md',
    };

    const p = pathName(name);
    const ref = { $ref: `#/components/schemas/${name}` };
    const errs = {
      '400': { $ref: '#/components/responses/ValidationFailed' },
      '401': { $ref: '#/components/responses/Unauthorized' },
    };
    paths[`/${p}`] = {
      get: {
        operationId: `list${name}`,
        summary: `Lista ${name}`,
        tags: [name],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: ref } } } },
          ...errs,
        },
      },
      post: {
        operationId: `create${name}`,
        summary: `Cria ${name}`,
        tags: [name],
        requestBody: { required: true, content: { 'application/json': { schema: ref } } },
        responses: { '201': { description: 'criado', content: { 'application/json': { schema: ref } } }, ...errs },
      },
    };
    paths[`/${p}/{id}`] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        operationId: `get${name}`,
        summary: `Detalha ${name}`,
        tags: [name],
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: ref } } },
          '404': { $ref: '#/components/responses/NotFound' },
          ...errs,
        },
      },
      put: {
        operationId: `update${name}`,
        summary: `Atualiza ${name}`,
        tags: [name],
        requestBody: { required: true, content: { 'application/json': { schema: ref } } },
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: ref } } },
          '404': { $ref: '#/components/responses/NotFound' },
          ...errs,
        },
      },
      delete: {
        operationId: `delete${name}`,
        summary: `Remove ${name}`,
        tags: [name],
        responses: { '204': { description: 'removido' }, '404': { $ref: '#/components/responses/NotFound' }, ...errs },
      },
    };
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: opts.title,
      version: '0.1.0',
      description: [
        'CONTRATO ÚNICO. Gerado por `rnc api gen` a partir de docs/functional/ + o IR do RNC.',
        '',
        'O esqueleto (schemas de entidade, erros, CRUD) é determinístico e pertence ao rnc —',
        'é a linha de base que `rnc trace` e `rnc api check` usam para julgar drift.',
        `Os pontos marcados com \`${AGENT_MARK}\` são do agente: operações semânticas,`,
        'shapes custom e exemplos com valores reais. Enriqueça DENTRO do esqueleto.',
        '',
        `Workspace RNC: ${ir.workspace} (${ir.sourceLang}).`,
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: {
        ...schemas,
        Error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', enum: ERROR_CODES },
            message: { type: 'string' },
            field: { type: 'string', description: 'campo que falhou, quando aplicável' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'não autenticado (fail-closed: autentica ANTES de validar o payload)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'não encontrado',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        ValidationFailed: {
          description: 'violação de invariante de domínio (INV-NN)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  };

  return toYaml(doc) ;
}

/** Minimal YAML emitter — no dependency, deterministic key order. */
function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null\n';
  if (typeof value === 'number' || typeof value === 'boolean') return `${value}\n`;
  if (typeof value === 'string') return `${scalar(value, indent)}\n`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]\n';
    let out = '\n';
    for (const item of value) {
      const rendered = toYaml(item, indent + 1);
      out += `${pad}- ${rendered.startsWith('\n') ? rendered.slice(1).replace(new RegExp(`^${'  '.repeat(indent + 1)}`), '') : rendered}`;
    }
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}\n';
  let out = indent === 0 ? '' : '\n';
  for (const [k, v] of entries) {
    const rendered = toYaml(v, indent + 1);
    out += `${pad}${quoteKey(k)}:${rendered.startsWith('\n') ? '' : ' '}${rendered}`;
  }
  return out;
}

function quoteKey(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(k) ? k : JSON.stringify(k);
}

function scalar(s: string, indent = 0): string {
  if (s.includes('\n')) {
    const pad = '  '.repeat(indent + 1);
    return `|-\n${s.split('\n').map((l) => (l ? `${pad}${l}` : '')).join('\n')}`;
  }
  if (s === '' || /^[\s]|[\s]$|^[-?:,\[\]{}#&*!|>'"%@`]|:\s|\s#/.test(s) || /^(true|false|null|~|\d+(\.\d+)?)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}
