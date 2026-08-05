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
 * OpenCode. Reads AGENTS.md natively. It does support remote MCP, but we still
 * use the local `rnc mcp proxy`: a remote entry would need the Bearer token
 * inline in opencode.json (a committed file), and the proxy keeps the secret in
 * the credential store instead.
 */
export const opencode: Adapter = {
  id: 'opencode',
  label: 'OpenCode',
  transport: 'stdio-proxy',
  detect(): Detection {
    return firstHit([
      [onPath('opencode'), 'opencode no PATH'],
      [inHome('.config/opencode', '.opencode'), '~/.config/opencode'],
    ]);
  },
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, 'opencode.json'),
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            rnc: {
              type: 'local',
              command: [MCP_COMMAND, ...MCP_ARGS],
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
    res.notes.push('OpenCode lê AGENTS.md nativo — regras já valem.');
    res.notes.push(LOGIN_NOTE);
  },
};

function doc(): string {
  return `# Usando o RNC harness com OpenCode

## Config gerada
- \`opencode.json\` — bloco \`mcp.rnc\` type **local**, comando
  \`npx -y @skalena/rnc mcp proxy\`.
- Regras: **AGENTS.md** (OpenCode lê nativo).

## Transporte
OpenCode também fala MCP remoto, mas um entry remoto exigiria o header
\`Authorization: Bearer <token>\` dentro do \`opencode.json\` — arquivo que vai pro
git. O proxy stdio faz a mesma ponte sem colocar segredo no repo.

## Token
Nenhum no arquivo. \`rnc mcp login\` grava a credencial; o proxy a lê.

## Como o OpenCode age
Roda \`rnc\` pelo shell como ferramenta determinística; obedece AGENTS.md; é
julgado por \`rnc trace --check\` / \`rnc verify\`. Zoom no legado via tools MCP.
**Não** chama \`rnc implement\` (recursão).
`;
}
