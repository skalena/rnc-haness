import { join } from 'node:path';
import { write, DEFAULT_BASE, TOKEN_NOTE, type Adapter, type AddResult } from './types.js';

/**
 * Kiro (AWS) — a spec-driven IDE. Best cultural fit, but it has its OWN spec
 * system. The steering file points Kiro at docs/functional as the single spec
 * source and forbids generating a parallel Kiro spec — otherwise you get two
 * competing sources of truth.
 */
export const kiro: Adapter = {
  id: 'kiro',
  label: 'Kiro (AWS)',
  transport: 'stdio-bridge',
  apply(cwd: string, res: AddResult): void {
    write(
      join(cwd, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            rnc: {
              command: 'npx',
              args: ['-y', 'mcp-remote', `${DEFAULT_BASE}/sse`, '--header', 'Authorization: Bearer ${RNC_TOKEN}'],
              disabled: false,
            },
          },
        },
        null,
        2,
      ) + '\n',
      res,
      '.kiro/settings/mcp.json',
    );

    write(join(cwd, '.kiro', 'steering', 'rnc.md'), steering(), res, '.kiro/steering/rnc.md');
    write(join(cwd, 'docs', 'agents', 'kiro.md'), doc(), res, 'docs/agents/kiro.md');
    res.notes.push('IMPORTANTE: a spec é docs/functional/ (do rnc) — NÃO deixe o Kiro gerar spec paralela.');
    res.notes.push(TOKEN_NOTE);
  },
};

function steering(): string {
  return `---
inclusion: always
---

# RNC harness — steering

A ESPECIFICAÇÃO deste projeto é \`docs/functional/\` (gerada por \`rnc spec\` a
partir do RNC). **NÃO crie uma spec própria do Kiro** (requirements/design/tasks
paralelos) — isso cria duas fontes de verdade concorrentes. Trate
\`docs/functional/\` como a spec do Kiro.

Regras completas: veja \`AGENTS.md\`. Resumo:
- Ordem SDD: analyze → spec → clarify → stack → runtime → verify → trace.
- Toda regra de domínio cita a INV e a BR-NNN. Incerteza → [PRESUMIDO] + traceability.
- Guardrails inegociáveis: dinheiro Decimal, build sem banco, fail-closed, lock de agregado.
- Rode \`rnc\` como ferramenta determinística; \`rnc trace --check\` é o juiz externo.
- NÃO rode \`rnc implement\` de dentro do Kiro (recursão).

Zoom no legado: tools do MCP server \`rnc\` (\`getModuleRules\`, \`getModuleDataModel\`, \`getUirModule\`).
`;
}

function doc(): string {
  return `# Usando o RNC harness com Kiro

Kiro é IDE spec-driven — o melhor encaixe cultural, com um risco: spec dupla.

## Config gerada
- \`.kiro/settings/mcp.json\` — server MCP \`rnc\` via ponte \`mcp-remote\`.
- \`.kiro/steering/rnc.md\` — steering \`inclusion: always\` que aponta o Kiro pra
  \`docs/functional/\` como spec e proíbe spec paralela.
- Regras completas: **AGENTS.md**.

## O ponto crítico
Kiro quer gerar requirements/design/tasks próprios. Aqui a fonte é
\`docs/functional/\` (do RNC). O steering força isso — não duplique.

## Transporte / token
Ponte \`mcp-remote\` (SSE→stdio). Substitua \`\${RNC_TOKEN}\`. Não comite.

## Como o Kiro age
Lê a spec de \`docs/functional/\`, dá tasks a partir dela, chama \`rnc\` como
ferramenta e as tools MCP pra zoom. Humano-no-loop (IDE), não batch. Julgado por
\`rnc verify\` / \`rnc trace --check\`.
`;
}
