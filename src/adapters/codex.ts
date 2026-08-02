import { join } from 'node:path';
import { write, DEFAULT_BASE, TOKEN_NOTE, type Adapter, type AddResult } from './types.js';

/**
 * Codex (OpenAI CLI). Reads AGENTS.md natively. MCP is stdio-only → bridge the
 * RNC SSE server with `mcp-remote`. Config lives in ~/.codex/config.toml; we
 * write a project-local snippet to merge (Codex reads the global file).
 */
export const codex: Adapter = {
  id: 'codex',
  label: 'Codex (OpenAI)',
  transport: 'stdio-bridge',
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, '.codex', 'config.toml'),
      `# RNC MCP — ponte SSE→stdio via mcp-remote.
# Codex lê ~/.codex/config.toml (global). Faça merge deste bloco lá se o
# projeto-local não for lido pela sua versão do Codex.
[mcp_servers.rnc]
command = "npx"
args = ["-y", "mcp-remote", "${DEFAULT_BASE}/sse", "--header", "Authorization: Bearer \${RNC_TOKEN}"]
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
    res.notes.push(TOKEN_NOTE);
  },
};

function doc(): string {
  return `# Usando o RNC harness com Codex

## Config gerada
- \`.codex/config.toml\` — server MCP \`rnc\` via ponte \`mcp-remote\` (SSE→stdio).
  Faça merge em \`~/.codex/config.toml\` se necessário.
- \`.codex/prompts/rnc.md\` — atalho apontando pro método.
- Regras: **AGENTS.md** (Codex lê nativo — nada extra).

## Transporte
Codex fala MCP stdio; a ponte \`npx mcp-remote https://api.rnc.skalena.co/sse\`
converte o SSE do RNC. Requer \`npx\` no PATH.

## Token
Substitua \`\${RNC_TOKEN}\` pelo token de \`rnc mcp login\`. Não comite.

## Como o Codex age
Roda \`rnc\` pelo shell como ferramenta determinística; obedece os guardrails do
AGENTS.md; é julgado por \`rnc trace --check\` / \`rnc verify\`. **Não** chama
\`rnc implement\` (dispararia outro agente). Zoom no legado via tools MCP
(\`getModuleRules\`, \`getModuleDataModel\`).
`;
}
