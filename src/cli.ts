#!/usr/bin/env node
import pc from 'picocolors';
import { initCmd } from './commands/init.js';
import { analyzeCmd } from './commands/analyze.js';
import { specCmd } from './commands/spec.js';
import { clarifyCmd } from './commands/clarify.js';
import { stackCmd } from './commands/stack.js';
import { runtimeCmd } from './commands/runtime.js';
import { doctorCmd } from './commands/doctor.js';
import { mcpCmd } from './commands/mcp.js';
import { configCmd } from './commands/config.js';

const VERSION = '0.1.0';

const HELP = `
${pc.bold('rnc')} — RNC Harness CLI  ${pc.dim(`v${VERSION}`)}

  Modernização spec-driven (SDD) de legado. A análise vem do RNC via MCP;
  o workflow é fixo, a stack alvo é composável.

${pc.bold('Auth')} (RNC MCP):
  ${pc.cyan('rnc mcp login')}                pareia via navegador, salva token (0600, 90d)
  ${pc.cyan('rnc mcp whoami')}               identidade + workspaces visíveis
  ${pc.cyan('rnc mcp status')}               estado da credencial local
  ${pc.cyan('rnc mcp logout')}               esquece token localmente
  ${pc.cyan('rnc config set workspace')} <n> define workspace padrão

${pc.bold('Fluxo SDD')} (ordem fixa):
  ${pc.cyan('rnc init')} [nome]              scaffold: docs funcionais + AGENTS.md + .mcp.json
  ${pc.cyan('rnc analyze')} --workspace <id> puxa análise do legado (RNC MCP → IR)
  ${pc.cyan('rnc spec')}                     gera docs/functional/ (stack-neutras)
  ${pc.cyan('rnc clarify')}                  gate: pontos que o RNC não resolveu sozinho
  ${pc.cyan('rnc stack')}                    escolhe arquitetura alvo (front/back/db)
  ${pc.cyan('rnc runtime')} up               golden→sem docker · resto→docker-compose
  ${pc.cyan('rnc doctor')}                   diagnóstico

${pc.bold('rnc stack')} não-interativo:
  rnc stack --golden
  rnc stack --front vue --back quarkus --db postgres

Config:  ${pc.dim('RNC_BASE_URL')} (default http://localhost:8080) · ${pc.dim('RNC_CONFIG_HOME')} (default ~/.rnc)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'init':
      return initCmd(rest);
    case 'analyze':
      return analyzeCmd(rest);
    case 'spec':
      return specCmd();
    case 'clarify':
      return clarifyCmd();
    case 'stack':
      return stackCmd(rest);
    case 'runtime':
      return runtimeCmd(rest);
    case 'mcp':
      return mcpCmd(rest);
    case 'config':
      return configCmd(rest);
    case 'doctor':
      return doctorCmd();
    case '-v':
    case '--version':
      console.log(VERSION);
      return;
    case undefined:
    case '-h':
    case '--help':
      console.log(HELP);
      return;
    default:
      console.log(`${pc.red('comando desconhecido:')} ${cmd}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(pc.red(`erro: ${e?.message ?? e}`));
  process.exit(1);
});
