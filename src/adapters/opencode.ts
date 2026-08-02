import { join } from 'node:path';
import { write, DEFAULT_BASE, TOKEN_NOTE, type Adapter, type AddResult } from './types.js';

/**
 * OpenCode. Reads AGENTS.md natively and supports REMOTE MCP directly (no
 * bridge needed) — point it straight at the RNC SSE endpoint.
 */
export const opencode: Adapter = {
  id: 'opencode',
  label: 'OpenCode',
  transport: 'sse-native',
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, 'opencode.json'),
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            rnc: {
              type: 'remote',
              url: `${DEFAULT_BASE}/sse`,
              headers: { Authorization: 'Bearer ${RNC_TOKEN}' },
              enabled: true,
            },
          },
        },
        null,
        2,
      ) + '\n',
      res,
      'opencode.json',
    );

    write(join(cwd, 'docs', 'agents', 'opencode.md'), doc(), res, 'docs/agents/opencode.md');
    res.notes.push('OpenCode fala MCP remoto nativo — sem ponte mcp-remote.');
    res.notes.push('OpenCode lê AGENTS.md nativo — regras já valem.');
    res.notes.push(TOKEN_NOTE);
  },
};

function doc(): string {
  return `# Usando o RNC harness com OpenCode

## Config gerada
- \`opencode.json\` — bloco \`mcp.rnc\` type **remote** (SSE direto, sem ponte).
- Regras: **AGENTS.md** (OpenCode lê nativo).

## Transporte
OpenCode suporta MCP remoto → aponta direto pra \`https://api.rnc.skalena.co/sse\`.
Não precisa de \`mcp-remote\`.

## Token
Substitua \`\${RNC_TOKEN}\` pelo token de \`rnc mcp login\`. Não comite
\`opencode.json\` com o token literal.

## Como o OpenCode age
Roda \`rnc\` pelo shell como ferramenta determinística; obedece AGENTS.md; é
julgado por \`rnc trace --check\` / \`rnc verify\`. Zoom no legado via tools MCP.
**Não** chama \`rnc implement\` (recursão).
`;
}
