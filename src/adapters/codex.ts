import { join } from 'node:path';
import { firstHit, inHome, onPath } from './detect.js';
import {
  write,
  LOGIN_NOTE,
  MCP_ARGS,
  MCP_COMMAND,
  type Adapter,
  type AddResult,
  type Detection,
} from './types.js';

/**
 * Codex (OpenAI CLI). Reads AGENTS.md natively. MCP is stdio-only, which is
 * exactly what `rnc mcp proxy` speaks. Config lives in ~/.codex/config.toml; we
 * write a project-local snippet to merge (Codex reads the global file).
 */
export const codex: Adapter = {
  id: 'codex',
  label: 'Codex (OpenAI)',
  transport: 'stdio-proxy',
  detect(): Detection {
    return firstHit([
      [onPath('codex'), 'codex no PATH'],
      [inHome('.codex'), '~/.codex'],
    ]);
  },
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, '.codex', 'config.toml'),
      `# RNC MCP — servidor stdio local (\`rnc mcp proxy\`), sem token no arquivo.
# Codex lê ~/.codex/config.toml (global). Faça merge deste bloco lá se o
# projeto-local não for lido pela sua versão do Codex.
[mcp_servers.rnc]
command = "${MCP_COMMAND}"
args = [${MCP_ARGS.map((a) => `"${a}"`).join(', ')}]
`,
      res,
      '.codex/config.toml',
    );

    // Codex reads AGENTS.md natively; add a slash-prompt pointer.
    write(
      join(cwd, '.codex', 'prompts', 'rnc.md'),
      `Siga AGENTS.md (método SDD + guardrails). Use os comandos rnc (analyze/spec/clarify/stack/runtime/trace/verify) como ferramentas determinísticas. NÃO rode \`rnc implement\` (recursão).
`,
      res,
      '.codex/prompts/rnc.md',
    );

    write(join(cwd, 'docs', 'agents', 'codex.md'), doc(), res, 'docs/agents/codex.md');
    res.notes.push('Codex lê AGENTS.md nativo — regras já valem.');
    res.notes.push(LOGIN_NOTE);
  },
};

function doc(): string {
  return `# Usando o RNC harness com Codex

## Config gerada
- \`.codex/config.toml\` — server MCP \`rnc\` via \`npx -y @skalena/rnc mcp proxy\`.
  Faça merge em \`~/.codex/config.toml\` se necessário.
- \`.codex/prompts/rnc.md\` — atalho apontando pro método.
- Regras: **AGENTS.md** (Codex lê nativo — nada extra).

## Transporte
Codex fala MCP stdio; \`rnc mcp proxy\` é um servidor stdio que faz a ponte pro
SSE do RNC. Requer \`npx\` no PATH.

## Token
Nenhum. O proxy lê a credencial de \`rnc mcp login\` (\`~/.rnc/credentials.json\`).
O \`.codex/config.toml\` não contém segredo e pode ser comitado.

## Como o Codex age
Roda \`rnc\` pelo shell como ferramenta determinística; obedece os guardrails do
AGENTS.md; é julgado por \`rnc trace --check\` / \`rnc verify\`. **Não** chama
\`rnc implement\` (dispararia outro agente). Zoom no legado via tools MCP
(\`getModuleRules\`, \`getModuleDataModel\`).
`;
}
