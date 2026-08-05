# RNC Harness

Modernize a legacy system into an application whose every business rule traces
back to the rule it came from — and prove it, in CI.

**Your agent is the front door; `rnc` is the engine.** You talk to Claude Code
(or Codex, Cursor, OpenCode); it calls `rnc` for the parts that have to be
deterministic. See [USAGE.md](./USAGE.md).

## Install (Claude Code plugin)

```
/plugin marketplace add skalena/rnc-haness
/plugin install rnc@skalena
/rnc-login
```

That is all. The plugin ships the skills, the slash commands, the RNC MCP
server and a session hook that tells the agent what is missing — and the engine
runs through `npx`, so there is nothing to install globally.

```
> moderniza o legado do workspace MasterApp Delphi
```

Other agents (Codex, Cursor, OpenCode, 70+ more) via
[`skills`](https://github.com/vercel-labs/skills):

```bash
npx skills@latest add skalena/rnc-haness
```

Or the engine on its own:

```bash
npm i -g @skalena/rnc && rnc mcp login
```

## Why it exists

The expensive, risky part of a modernization is not writing the new code — it is
**understanding what the old system actually does and proving the rules
survived**. That is where these projects bleed.

Every RNC workspace holds a different legacy (Delphi, COBOL, VB6, NATURAL,
Java…). RNC normalizes any of them into one legacy-neutral **IR**
(`src/core/analysis.ts`). Every phase keys off the IR, never the raw source
language, so the workflow is identical across all of them. Exercised, not
asserted: the same pipeline runs over a Java workspace (SAFO, 79 modules, 1699
rules) and a NATURAL one (SIFAP).

## What the plugin gives you

| Piece | What it does |
|---|---|
| **skills** | the agent knows the method, the guardrails and the verification discipline |
| **`/rnc-modernize` `/rnc-login` `/rnc-status`** | explicit entry points when you want them |
| **MCP server** | wired automatically — module-level zoom (`getModuleRules`, `getModuleDataModel`) |
| **session hook** | reports auth and project state at startup, so neither you nor the agent has to go looking |

## Skills, not a command ritual

Four skills, split by who invokes them:

| Skill | Invoked by | Role |
|---|---|---|
| `rnc-modernize` | **you** | conducts the flow: which workspace → extract → clarify gate → contract → architecture → build → verify |
| `rnc-provenance` | the agent, on its own | porting a rule auditably: every invariant cites its `BR-NNN` |
| `rnc-guardrails` | the agent, on its own | traps already paid for: money as float, build that needs a database, endpoint reachable without auth, stock race |
| `rnc-verify` | the agent, on its own | run the command instead of claiming it works |

Install across 70+ agents with [`skills`](https://github.com/vercel-labs/skills):

```bash
npx skills@latest add skalena/rnc-haness
```

## What the CLI keeps

The skills carry judgement. The CLI carries what a prompt cannot do twice the
same way:

- **Deterministic extraction** — same workspace in, same IR out. Not sampled: losing a business rule is the one failure this pipeline exists to prevent.
- **Gates** — high-impact ambiguity blocks code generation. A gate the agent can waive is not a gate.
- **An external referee** — `rnc trace --check` and `rnc api check` exit 1 on drift. The author is never the judge; in a regulated migration, independent verification *is* the product.

Neither half works alone: prompts cannot guarantee reproducibility, and a CLI
cannot conduct an interview or write a domain layer.

## Three layers of docs

- `docs/functional/` — **stack-neutral**, the source of truth, survives any stack change
- `docs/api/openapi.yaml` — the single contract; client, stubs, contract tests, mocks and docs all derive from it
- `docs/technical/` — **per-stack**, generated at build time

## Architecture: blueprints + contracts, not 72 templates

3 frontends × 6 backends × 4 databases would be unmaintainable as fixed
templates. Instead one **blueprint** per technology (`harness/blueprints/`) bound
by four **contracts** (`harness/contracts/`); a composer (`src/core/composer.ts`)
assembles a valid combo and emits the runtime.

```
frontend   next · vue · angular
backend    next-api · springboot · quarkus · dotnet · flask · go
database   postgres · mysql · mongo · sqlite
golden     next + next-api + sqlite   (the only no-docker combo)
```

Testability is a contract, not an afterthought: integration tests run against the
**real** database via Testcontainers (PGlite for the monorepo).

## Scope

Delivers a new system, built from the legacy and verified against the spec.

Deliberately **not** covered yet — the crossing from old to new: data migration
(production data violates the new invariants), cutover (strangler sequencing,
rollback), and parallel-run (both systems fed the same inputs, outputs diffed).
Those need live production access and business coordination, not code
generation. The IR is the raw material for automating them later.

## Development

```bash
npm install
npm run build
node dist/cli.js --help
```

Requires Node ≥ 20.12.
