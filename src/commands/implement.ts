import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { parseFlags } from '../core/args.js';
import { rncDir } from '../core/paths.js';
import { Analysis } from '../core/analysis.js';
import { loadStack, loadProgress, markDone, ensureRncDir } from '../core/state.js';
import { milestones, type Milestone } from '../core/roadmap.js';
import { MCP_TOOLS } from '../core/rnc.js';
import { log } from '../core/log.js';

/**
 * Drive Claude Code (headless) to build one milestone.
 *
 * rnc is the deterministic spine: it derives the milestone from the IR + stack,
 * enforces the clarify gate, and hands Claude Code a prompt carrying the goal,
 * the docs to read, the Definition-of-Done and the RNC MCP tools to zoom with.
 * Claude Code does the open-ended coding inside those rails.
 *
 *   rnc implement            # next pending milestone
 *   rnc implement M1         # a specific one
 *   rnc implement --list     # show the ladder + progress
 *   rnc implement M1 --dry-run   # write the prompt, don't spawn the agent
 */
export async function implementCmd(argv: string[]): Promise<void> {
  const { _, flags } = parseFlags(argv);

  const irPath = join(rncDir(), 'analysis.json');
  if (!existsSync(irPath)) {
    log.err('sem análise — rode: rnc analyze --workspace <id>');
    process.exit(1);
  }
  const ir = Analysis.parse(JSON.parse(readFileSync(irPath, 'utf8')));
  const stack = loadStack();
  if (!stack) {
    log.err('nenhuma stack escolhida — rode: rnc stack');
    process.exit(1);
  }

  const ladder = milestones(ir, stack);
  const done = loadProgress();

  if (flags.list) {
    log.head('Roadmap');
    for (const m of ladder) {
      const mark = done.includes(m.id) ? pc.green('✔') : pc.dim('○');
      log.plain(`  ${mark} ${pc.bold(m.id)} ${m.title}  ${pc.dim(m.goal.slice(0, 60))}…`);
    }
    return;
  }

  const target = _[0] ? ladder.find((m) => m.id.toLowerCase() === _[0]!.toLowerCase()) : ladder.find((m) => !done.includes(m.id));
  if (!target) {
    if (_[0]) log.err(`milestone '${_[0]}' não existe. Veja: rnc implement --list`);
    else log.ok('todos os milestones concluídos 🎉');
    process.exit(_[0] ? 1 : 0);
  }

  // clarify gate — high-impact unknowns block unless --force
  const blocking = ir.unknowns.filter((u) => u.impact === 'high');
  if (blocking.length && !flags.force) {
    log.head(`Bloqueado — ${blocking.length} ponto(s) ALTO a confirmar`);
    for (const u of blocking) log.warn(`${u.ref}: ${u.question}`);
    log.plain('');
    log.info('resolva em rnc clarify, ou force com --force (assume [PRESUMIDO])');
    process.exit(1);
  }

  const prompt = buildPrompt(target, ir, stack, blocking.length > 0);

  log.head(`rnc implement ${target.id} — ${target.title}`);
  log.info(`stack: ${stack.frontend} · ${stack.backend} · ${stack.database}`);
  log.info(`Definition of Done: ${target.dod.length} checks`);
  if (blocking.length) log.warn(`--force: ${blocking.length} dúvida(s) ALTO assumida(s) como [PRESUMIDO]`);
  log.plain('');

  if (flags['dry-run']) {
    const out = join(ensureRncDir(), `implement-${target.id}.md`);
    writeFileSync(out, prompt);
    log.ok(`prompt escrito → ${out.replace(process.cwd() + '/', '')}`);
    log.info('dry-run: agente não disparado. Revise e rode sem --dry-run.');
    return;
  }

  // spawn Claude Code headless; it already has RNC MCP (.mcp.json) + AGENTS.md
  log.step('Disparando Claude Code (headless)…');
  const args = ['-p', '--permission-mode', 'acceptEdits'];
  if (flags.model) args.push('--model', String(flags.model));
  const res = spawnSync('claude', args, { input: prompt, stdio: ['pipe', 'inherit', 'inherit'] });

  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') {
    const out = join(ensureRncDir(), `implement-${target.id}.md`);
    writeFileSync(out, prompt);
    log.err('`claude` não encontrado no PATH.');
    log.ok(`prompt salvo → ${out.replace(process.cwd() + '/', '')}`);
    log.info('instale o Claude Code, ou cole o prompt num agente que leia AGENTS.md');
    process.exit(1);
  }
  if (res.status !== 0) {
    log.err(`Claude Code saiu com código ${res.status} — milestone NÃO marcado como pronto`);
    process.exit(res.status ?? 1);
  }

  markDone(target.id);
  log.plain('');
  log.ok(`${target.id} marcado como pronto`);
  log.info(`verifique: ${pc.cyan('rnc runtime up')} · ${pc.cyan('rnc trace --check')}`);
  log.info(`próximo: ${pc.cyan('rnc implement')}`);
}

function buildPrompt(m: Milestone, ir: Analysis, stack: { frontend: string; backend: string; database: string }, forced: boolean): string {
  const units = m.units.length ? m.units.map((u) => `- ${u}`).join('\n') : '(nenhuma unidade específica)';
  return `Você é o Claude Code trabalhando dentro do harness RNC. Leia AGENTS.md antes de tudo — ele traz o método SDD e os guardrails, que têm prioridade.

# Milestone ${m.id} — ${m.title}

## Objetivo
${m.goal}

## Stack alvo (já escolhida — NÃO troque)
frontend: ${stack.frontend} · backend: ${stack.backend} · database: ${stack.database}

## Fonte da verdade (leia ANTES de codar)
${m.readDocs.map((d) => `- ${d}`).join('\n')}
A spec funcional é stack-neutra. Onde precisar de detalhe do legado, use as tools do RNC MCP.

## Legado no RNC (workspace ${ir.workspace}, ${ir.sourceLang})
Unidades mais relevantes deste milestone (dê zoom via MCP):
${units}

Tools RNC MCP disponíveis (identidade vem do Bearer; toda call é tenant-scoped):
${MCP_TOOLS.map((t) => `- ${t}`).join('\n')}
Use getModuleRules / getModuleDataModel / getUirModule para confirmar semântica antes de implementar uma regra.

## Definition of Done (obrigatória — não marque pronto sem cumprir)
${m.dod.map((d) => `- [ ] ${d}`).join('\n')}

## Regras
- Toda regra de domínio cita a INV e a BR-NNN de origem em comentário.
- Incerteza vira [PRESUMIDO] no código + item em docs/functional/06-traceability.md.${forced ? ' (Este run foi forçado com dúvidas ALTO em aberto — marque cada uma [PRESUMIDO] explicitamente.)' : ''}
- Guardrails do AGENTS.md são inegociáveis (dinheiro Decimal, build sem banco, fail-closed, lock de agregado, nada de componente falando com o banco).
- NÃO exceda o escopo deste milestone. Ao terminar, rode build/typecheck/testes e RELATE o que passou e o que ficou pendente.

Comece lendo AGENTS.md e os docs acima. Depois implemente ${m.id}.`;
}
