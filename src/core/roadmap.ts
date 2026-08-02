import type { Analysis } from './analysis.js';
import { buildOrder } from './analysis.js';
import type { Stack } from './composer.js';

export interface Milestone {
  id: string;
  title: string;
  goal: string;
  /** Functional docs the agent must read first. */
  readDocs: string[];
  /** Definition of Done — executable checks, not vibes. */
  dod: string[];
  /** Legacy units most relevant to this milestone (for MCP zoom). */
  units: string[];
}

/** Heuristic: does the domain look like it owns a mutable ledger (stock/saldo)? */
function hasLedger(ir: Analysis): boolean {
  return ir.entities.some((e) => /stock|estoque|saldo|item|part|inventor/i.test(e.name));
}

/** Integration test tool for the chosen backend/database. */
function integrationTool(stack: Stack): string {
  if (stack.database === 'sqlite' || stack.backend === 'next-api') return 'PGlite (in-memory)';
  return 'Testcontainers (banco real)';
}

/**
 * Fixed SDD milestone ladder, populated from the IR + target stack. Same rungs
 * for every legacy; the content (units, entities, DoD tooling) comes from data.
 */
export function milestones(ir: Analysis, stack: Stack): Milestone[] {
  const order = buildOrder(ir);
  const topUnits = order.slice(0, 6).map((u) => u.id);
  const screenUnits = ir.surfaces.filter((s) => s.kind === 'screen').map((s) => s.label);
  const reportUnits = ir.surfaces.filter((s) => s.kind === 'report').map((s) => s.label);
  const itest = integrationTool(stack);
  const ledger = hasLedger(ir);

  const ladder: Milestone[] = [
    {
      id: 'M0',
      title: 'Fundação',
      goal:
        stack.runtime === 'none'
          ? 'Monorepo Next.js + SQLite (Drizzle). lib de dinheiro (Decimal, half-up), lib de erros, harness de teste. Conexão de banco preguiçosa (build não exige banco).'
          : `Esqueleto ${stack.frontend} + ${stack.backend} + ${stack.database}. lib de dinheiro (Decimal), lib de erros, harness de teste. Conexão preguiçosa. docker-compose já gerado por rnc runtime.`,
      readDocs: ['docs/functional/00-vision.md'],
      dod: ['build limpo', 'typecheck limpo', 'suíte de teste roda (mesmo vazia)', 'dinheiro nunca em float'],
      units: [],
    },
    {
      id: 'M1',
      title: 'Schema + Domínio',
      goal: `Schema (${ir.entities.length} entidades) + migração versionada. Camada de domínio pura implementando os invariantes. NENHUM componente fala com o banco.`,
      readDocs: ['docs/functional/01-data-model.md', 'docs/functional/02-domain-rules.md', 'docs/functional/06-traceability.md'],
      dod: [
        'toda função de domínio cita a INV e a BR-NNN de origem',
        `teste unitário por invariante (${itest})`,
        ...(ledger ? ['teste de CONCORRÊNCIA: N requisições paralelas na mesma peça → sucessos limitados, resto rejeitado, saldo íntegro (lock do agregado raiz FOR UPDATE)'] : []),
        'invariantes aplicados no SERVIDOR, não só na UI',
      ],
      units: topUnits,
    },
    {
      id: 'M2',
      title: 'Telas / Fluxos',
      goal: `Telas e fluxos (${screenUnits.length} surfaces). Busca/ordenação/paginação no servidor. Estados de vazio/carregando/erro.`,
      readDocs: ['docs/functional/03-flows.md', 'docs/functional/01-features.md'],
      dod: [
        'cada mutação revalida a rota afetada',
        'nenhum label do legado vazou pra UI',
        'endpoint/Server Action é fail-closed: autentica antes de validar',
      ],
      units: screenUnits.slice(0, 8),
    },
    ...(reportUnits.length
      ? [
          {
            id: 'M3',
            title: 'Relatórios / Integrações',
            goal: `Relatórios (${reportUnits.length}) e integrações. Verificar extraindo o conteúdo gerado, não só o status.`,
            readDocs: ['docs/functional/03-flows.md'],
            dod: ['saída do relatório conferida contra o banco (valores batem)'],
            units: reportUnits,
          } as Milestone,
        ]
      : []),
    {
      id: reportUnits.length ? 'M4' : 'M3',
      title: 'Endurecimento',
      goal: 'Auth em toda ação, índices medidos sob EXPLAIN, acessibilidade, E2E em navegador real.',
      readDocs: ['docs/functional/06-traceability.md'],
      dod: [
        'autenticação exigida em TODA ação de escrita',
        'índices decididos por EXPLAIN com volume, não adivinhados',
        'E2E cobrindo o fluxo crítico',
        'rnc trace --check sem drift',
      ],
      units: [],
    },
  ];
  return ladder;
}
