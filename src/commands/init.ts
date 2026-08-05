import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { ensureRncDir } from '../core/state.js';
import { baseUrl, readConfig, setDefaultWorkspace } from '../core/config.js';
import { loadCredential, isExpired } from '../core/credentials.js';
import { pickWorkspace } from '../core/pick.js';
import { log } from '../core/log.js';

const HARNESS_VERSION = '0.8.0';

/**
 * Scaffold a project for the SDD workflow: functional docs skeleton (stack-
 * neutral), the shared AGENTS.md spine + thin CLAUDE.md import, and .rnc state.
 * The RNC MCP server pointer is written so the chosen agent tool can reach it.
 */
export async function initCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);
  const cwd = process.cwd();
  const name = _[0] ?? 'app';
  // resolve the workspace up front: flag → stored default → pick from the list.
  // A placeholder is only left behind when nobody is authenticated yet.
  let workspace = flags.workspace ? String(flags.workspace) : readConfig().defaultWorkspace ?? '';
  if (!workspace) {
    const cred = loadCredential(baseUrl());
    if (cred && !isExpired(cred)) {
      const ws = await pickWorkspace(baseUrl(), cred.accessToken, 'Workspace RNC deste projeto');
      workspace = ws.id;
      setDefaultWorkspace(ws.id);
    } else {
      workspace = '<RNC_WORKSPACE_ID>';
    }
  }

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
  // The base URL is written literally (it is not a secret and every agent
  // resolves it the same way); only the token stays an env var, so the file is
  // safe to commit. Populate it with: export RNC_TOKEN=$(rnc mcp token)
  write(
    join(cwd, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          rnc: {
            type: 'sse',
            url: `${baseUrl()}/sse`,
            headers: { Authorization: 'Bearer ${RNC_TOKEN}' },
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  write(join(cwd, '.rnc', 'harness.lock'), `harness: ${HARNESS_VERSION}\nworkspace: ${workspace}\n`);
  write(
    join(cwd, '.env.example'),
    [
      `RNC_BASE_URL=${baseUrl()}`,
      '# preencha com: rnc mcp token',
      'RNC_TOKEN=',
      `RNC_WORKSPACE=${workspace}`,
      '',
    ].join('\n'),
  );

  log.plain('');
  log.ok('docs/functional/  (5 arquivos, stack-neutros)');
  log.ok('docs/api/  docs/technical/');
  log.ok('AGENTS.md + CLAUDE.md (import)');
  log.ok(`.mcp.json  → rnc @ ${baseUrl()}/sse`);
  log.ok('.rnc/harness.lock · .env.example');
  log.plain('');
  log.plain('  conectar o Claude Code a este projeto:');
  log.plain(`    ${pc.cyan('export RNC_TOKEN=$(rnc mcp token)')}`);
  log.plain('');
  log.plain('  próximos passos:');
  log.plain(`    ${pc.cyan('rnc analyze')}`);
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

Trabalhe sempre na ordem: analyze → spec → clarify → stack → runtime → verify → trace.
Nunca gere código antes de \`docs/functional/\` existir e o gate \`clarify\` estar resolvido.

## Ferramentas \`rnc\` (rode via shell — determinísticas, não improvise)

Prefira estes comandos a inventar estrutura/config na mão:

| Rode | Quando | Em vez de |
|---|---|---|
| \`rnc doctor\` | início | adivinhar estado do ambiente/auth |
| \`rnc analyze --workspace <id>\` | início | queries ad hoc ao RNC |
| \`rnc spec\` | após analyze | inventar estrutura de docs |
| \`rnc clarify\` | antes de codar | assumir semântica no escuro |
| \`rnc api gen\` | após spec | escrever openapi.yaml do zero |
| \`rnc api check\` | após enriquecer o contrato | achar que o contrato está válido |
| \`rnc stack --front .. --back .. --db ..\` | escolher alvo | montar config à mão |
| \`rnc runtime up\` | subir ambiente | escrever docker-compose de cabeça |
| \`rnc trace --check\` | após cada milestone | achar que não driftou |

Dois acessos ao RNC, complementares: o \`rnc\` (bulk/determinístico, lê \`.rnc/analysis.json\` + docs) e as tools do MCP server \`rnc\` (zoom vivo num módulo: \`getModuleRules\`, \`getModuleDataModel\`, \`getUirModule\`). Use os dois.

## Guardrail — NÃO chame \`rnc implement\`

\`rnc implement\` dispara OUTRO agente headless — chamá-lo de dentro desta sessão causa recursão. Aqui, use só \`analyze/spec/clarify/stack/runtime/trace/doctor\`. \`implement\` é o modo de fora-pra-dentro (orquestra você); os outros são de dentro-pra-fora (você os chama).

## Fonte da verdade

- \`docs/functional/\` é stack-neutro. Não referencie stack aqui.
- \`docs/api/openapi.yaml\` é o contrato único. Front, back, testes e docs derivam dele.
  O **esqueleto** (schemas de entidade, erros, CRUD) pertence ao \`rnc\` — não reescreva o arquivo
  inteiro, senão os dois lados passam a ser construídos contra contratos diferentes. Enriqueça
  **dentro** dele: operações semânticas, shapes custom e \`examples\` com valores reais, nos pontos
  marcados \`x-rnc-agent-fill\`. Depois rode \`rnc api check\` — o juiz é externo.
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
