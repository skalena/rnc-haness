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
import { implementCmd } from './commands/implement.js';
import { traceCmd } from './commands/trace.js';
import { verifyCmd } from './commands/verify.js';
import { addCmd } from './commands/add.js';
import { apiCmd } from './commands/api.js';
import { workspacesCmd } from './commands/workspaces.js';
import { installCmd } from './commands/install.js';

const VERSION = '0.7.1';

/** Skalena plug-bot — cyan eyes + base, bold outline. */
const BANNER = [
  pc.bold('    ╭────────────╮'),
  pc.bold('    │  ') + pc.cyan('▟▙') + pc.bold('    ') + pc.cyan('▟▙') + pc.bold('   │'),
  pc.bold('    │  ') + pc.cyan('▜▛') + pc.bold('    ') + pc.cyan('▜▛') + pc.bold('   │'),
  pc.bold('    ╰────────────╯'),
  '   ' + pc.cyan('▐██████████████▌'),
  pc.bold('      ██      ██') + '   ' + pc.bold('SKALENA'),
].join('\n');

const HELP = `
${BANNER}

${pc.bold('rnc')} — RNC Harness CLI  ${pc.dim(`v${VERSION}`)}

  Motor de modernização de legado. A porta de entrada é o seu agente:

    ${pc.cyan('rnc install')}   ${pc.dim('# instala as skills no Claude Code (ou: npx skills add skalena/rnc-haness)')}
    ${pc.cyan('claude')}        ${pc.dim('> "moderniza meu legado"')}

  Os comandos abaixo são o motor — o agente os chama por você.

${pc.bold('Auth')} (RNC MCP):
  ${pc.cyan('rnc mcp login')}                pareia via navegador; sem pairing, pede token (colagem oculta)
  ${pc.cyan('rnc mcp login')} --token <t>    autentica direto com token do web app
  ${pc.cyan('rnc mcp whoami')}               identidade + workspaces visíveis
  ${pc.cyan('rnc mcp status')}               estado da credencial local
  ${pc.cyan('rnc mcp token')}                imprime o token (p/ export RNC_TOKEN=$(...))
  ${pc.cyan('rnc mcp logout')}               esquece token localmente
  ${pc.cyan('rnc workspaces')}               lista os workspaces e escolhe com qual trabalhar
  ${pc.cyan('rnc config set workspace')} <n> define workspace padrão pelo nome/id

${pc.bold('Fluxo SDD')} (ordem fixa):
  ${pc.cyan('rnc init')} [nome]              scaffold: docs funcionais + AGENTS.md + .mcp.json
  ${pc.cyan('rnc add')} <codex|kiro|opencode> conecta outro agente (config MCP + regras + doc)
  ${pc.cyan('rnc analyze')} [--pick]         puxa análise do legado (RNC → IR); --pick escolhe da lista
  ${pc.cyan('rnc spec')}                     gera docs/functional/ (stack-neutras)
  ${pc.cyan('rnc clarify')}                  gate: pontos que o RNC não resolveu sozinho
  ${pc.cyan('rnc api')} gen|check            contrato OpenAPI: esqueleto determinístico · juiz
  ${pc.cyan('rnc stack')}                    escolhe arquitetura alvo (front/back/db)
  ${pc.cyan('rnc runtime')} up               golden→sem docker · resto→docker-compose
  ${pc.cyan('rnc implement')} [M<n>]         dispara Claude Code headless p/ o milestone
  ${pc.cyan('rnc verify')}                   roda gates do projeto + trace (DoD do milestone)
  ${pc.cyan('rnc trace')} --check            drift código↔spec↔RNC (exit 1 no CI)
  ${pc.cyan('rnc doctor')}                   diagnóstico

  ${pc.cyan('rnc implement')} --list · --dry-run · --force · --model <m>

${pc.bold('rnc stack')} não-interativo:
  rnc stack --golden
  rnc stack --front vue --back quarkus --db postgres

Config:  ${pc.dim('RNC_BASE_URL')} (default https://api.rnc.skalena.co) · ${pc.dim('RNC_CONFIG_HOME')} (default ~/.rnc)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'init':
      return initCmd(rest);
    case 'add':
      return addCmd(rest);
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
    case 'implement':
      return implementCmd(rest);
    case 'api':
      return apiCmd(rest);
    case 'trace':
      return traceCmd(rest);
    case 'verify':
      return verifyCmd();
    case 'mcp':
      return mcpCmd(rest);
    case 'config':
      return configCmd(rest);
    case 'workspaces':
    case 'ws':
      return workspacesCmd(rest);
    case 'install':
      return installCmd(rest);
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
