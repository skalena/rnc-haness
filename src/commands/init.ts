import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { ensureRncDir } from '../core/state.js';
import { log } from '../core/log.js';

/**
 * Scaffold a project for the SDD workflow: functional docs skeleton (stack-
 * neutral), the shared AGENTS.md spine + thin CLAUDE.md import, and .rnc state.
 * The RNC MCP server pointer is written so the chosen agent tool can reach it.
 */
export async function initCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const cwd = process.cwd();
  const name = _[0] ?? 'app';
  const workspace = flags.workspace ? String(flags.workspace) : '<RNC_WORKSPACE_ID>';

  log.head(`rnc init — ${name}`);

  ensureRncDir(cwd);
  mk(join(cwd, 'docs', 'functional'));
  mk(join(cwd, 'docs', 'api'));
  mk(join(cwd, 'docs', 'technical'));

  // functional docs are stack-neutral and survive any stack change
  write(join(cwd, 'docs', 'functional', '00-vision.md'), `# ${name} — Visão\n\n> Gerado por \`rnc spec\` a partir de \`.rnc/analysis.json\`.\n`);
  write(join(cwd, 'docs', 'functional', '01-features.md'), `# Features & User Stories\n\n> US-NNN com critério de aceite. Fonte: RNC IR.\n`);
  write(join(cwd, 'docs', 'functional', '02-domain-rules.md'), `# Invariantes de domínio\n\n> INV-NN ← BR-NNN do legado (rastreável).\n`);
  write(join(cwd, 'docs', 'functional', '03-flows.md'), `# Fluxos / Telas\n\n> Ou jobs, se o legado for batch.\n`);
  write(join(cwd, 'docs', 'functional', '04-glossary.md'), `# Glossário (linguagem ubíqua)\n`);
  write(join(cwd, 'docs', 'api', '.gitkeep'), '');
  write(join(cwd, 'docs', 'technical', '.gitkeep'), '');

  // AGENTS.md — shared spine read by Codex/OpenCode/Bob; CLAUDE.md imports it
  write(
    join(cwd, 'AGENTS.md'),
    agentsMd(name, workspace),
  );
  write(join(cwd, 'CLAUDE.md'), `@AGENTS.md\n`);

  // MCP server pointer (Claude Code reads .mcp.json). SSE transport — the only
  // one Spring AI 1.0.0 ships (RNC-MCP-INTEGRATION.md §7). Token comes from
  // `rnc mcp login`; the same credential drives `claude mcp add rnc`.
  write(
    join(cwd, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          rnc: {
            type: 'sse',
            url: '${RNC_BASE_URL}/sse',
            headers: { Authorization: 'Bearer ${RNC_TOKEN}' },
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  write(join(cwd, '.rnc', 'harness.lock'), `harness: 0.1.0\nworkspace: ${workspace}\n`);
  write(join(cwd, '.env.example'), `RNC_WORKSPACE=${workspace}\nRNC_TOKEN=\n`);

  log.plain('');
  log.ok('docs/functional/  (5 arquivos, stack-neutros)');
  log.ok('docs/api/  docs/technical/');
  log.ok('AGENTS.md + CLAUDE.md (import)');
  log.ok('.mcp.json  → rnc @ https://rnc.skalena.com/mcp');
  log.ok('.rnc/harness.lock · .env.example');
  log.plain('');
  log.plain('  próximos passos:');
  log.plain(`    ${pc.cyan(`rnc analyze --workspace ${workspace}`)}`);
  log.plain(`    ${pc.cyan('rnc spec')}   ${pc.dim('# gera docs funcionais')}`);
  log.plain(`    ${pc.cyan('rnc stack')}  ${pc.dim('# escolhe arquitetura alvo')}`);
}

function mk(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function write(path: string, content: string): void {
  mk(join(path, '..'));
  if (existsSync(path)) {
    log.warn(`existe, mantido: ${path.replace(process.cwd() + '/', '')}`);
    return;
  }
  writeFileSync(path, content);
}

function agentsMd(name: string, workspace: string): string {
  return `# ${name} — regras do agente

Fonte da verdade: workspace RNC \`${workspace}\` via MCP server \`rnc\`.

## Método (fixo — SDD)

Trabalhe sempre na ordem: analyze → spec → clarify → stack → roadmap → implement → verify → trace.
Nunca gere código antes de \`docs/functional/\` existir e o gate \`clarify\` estar resolvido.

## Fonte da verdade

- \`docs/functional/\` é stack-neutro. Não referencie stack aqui.
- \`docs/api/openapi.yaml\` é o contrato único. Front, back, testes e docs derivam dele.
- Toda regra de domínio cita a \`BR-NNN\` de origem. Incerteza vira \`[PRESUMIDO]\` + item em traceability.

## Guardrails (lições embutidas — não redescobrir)

- Dinheiro nunca em float. Decimal, arredondamento half-up.
- Build não pode exigir banco (conexão lazy).
- Server Action / endpoint é fail-closed: autentica antes de validar payload.
- Mutação de estoque só em transação, com lock do agregado raiz (evita corrida).
- Nenhum componente fala com o banco — só a camada de domínio.

## Testabilidade (não opcional)

Toda camada entrega teste. Integração usa o banco REAL (Testcontainers / PGlite).
Contract-test na costura do OpenAPI. Definição de pronto por feature no roadmap.
`;
}
