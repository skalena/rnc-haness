import { existsSync } from 'node:fs';
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
 * Claude Code. `rnc init` already writes .mcp.json and CLAUDE.md, so this
 * adapter is normally a no-op that reports "existe, mantido". It exists anyway
 * because `rnc add` now lists installed agents: leaving out the one agent the
 * harness was built around would make the list read as "Claude Code can't be
 * connected", and it also repairs a project whose .mcp.json was deleted.
 */
export const claude: Adapter = {
  id: 'claude',
  label: 'Claude Code',
  transport: 'stdio-proxy',
  detect(): Detection {
    return firstHit([
      [onPath('claude'), 'claude no PATH'],
      [inHome('.claude'), '~/.claude'],
    ]);
  },
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            rnc: {
              command: MCP_COMMAND,
              args: MCP_ARGS,
            },
          },
        },
        null,
        2,
      ) + '\n',
      res,
      '.mcp.json',
    );

    // CLAUDE.md is a one-line import of the shared spine; rnc init writes it.
    if (!existsSync(join(cwd, 'CLAUDE.md'))) write(join(cwd, 'CLAUDE.md'), '@AGENTS.md\n', res, 'CLAUDE.md');

    write(join(cwd, 'docs', 'agents', 'claude.md'), doc(), res, 'docs/agents/claude.md');
    res.notes.push('Claude Code pede aprovação do server na primeira abertura do projeto (`/mcp` mostra o estado).');
    res.notes.push(LOGIN_NOTE);
  },
};

function doc(): string {
  return `# Usando o RNC harness com Claude Code

## Config gerada
- \`.mcp.json\` — server MCP \`rnc\` via \`npx -y @skalena/rnc mcp proxy\`.
- \`CLAUDE.md\` — import de uma linha (\`@AGENTS.md\`); as regras vivem no AGENTS.md.

## Transporte / token
Servidor stdio local que faz a ponte pro SSE do RNC. Sem token no arquivo — o
proxy lê a credencial de \`rnc mcp login\`, então \`.mcp.json\` pode ser comitado.

## Verificando
Abra o projeto e rode \`/mcp\`: o server \`rnc\` deve aparecer conectado. Se
disser não autenticado, rode \`rnc mcp login\` e reabra.

## Como o Claude Code age
Segue AGENTS.md, roda \`rnc\` como ferramenta determinística e usa as tools MCP
(\`getModuleRules\`, \`getModuleDataModel\`, \`getUirModule\`) pra zoom no legado.
É o agente que \`rnc implement\` dispara em headless — não chame \`rnc implement\`
de dentro dele (recursão).
`;
}
