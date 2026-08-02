# RNC Harness CLI (`rnc`)

Spec-driven modernization of legacy systems into **testable, containerized**
architectures. The legacy analysis comes from **RNC via MCP**; the workflow is
fixed for every user, and the target stack is composable.

Inspired by [github/spec-kit](https://github.com/github/spec-kit) — but the
payload is the RNC MCP server plus an SDD method extracted from a real
modernization (Delphi → Next.js), not generic templates.

## Why it exists

Every RNC workspace holds a *different* legacy (Delphi, COBOL, VB6, NATURAL,
PL/SQL…). RNC normalizes any of them into one legacy-neutral **IR**
(`src/core/analysis.ts`). Because every phase keys off the IR — never the raw
source language — the user-facing workflow is identical across all of them.

## The workflow (fixed)

```
analyze → spec → clarify → stack → runtime → (roadmap → implement → verify → trace)
```

| Command | Does |
|---|---|
| `rnc init [name]` | scaffold: functional docs, `AGENTS.md` (+ thin `CLAUDE.md`), `.mcp.json` → RNC |
| `rnc analyze --workspace <id>` | pull legacy analysis from RNC MCP → IR (`.rnc/analysis.json`) |
| `rnc spec` | generate `docs/functional/` — **stack-neutral**, the source of truth |
| `rnc clarify` | gate: unknowns RNC could not resolve (ambiguous/discarded/low-confidence) |
| `rnc stack` | choose target architecture (front × back × db) |
| `rnc runtime up` | golden → no docker · everything else → generated `docker-compose.yaml` |
| `rnc doctor` | diagnose harness + project |

`implement / verify / trace / roadmap` are the next milestones (see below).

## Three layers of docs

- `docs/functional/` — **stack-neutral**, survives any stack change (from RNC IR)
- `docs/api/openapi.yaml` — the single API contract; front, back, tests, docs all derive from it
- `docs/technical/` — **per-stack**, generated at `implement` time

## Architecture: blueprints + contracts, not 72 templates

3 frontends × 6 backends × 4 databases would be unmaintainable as fixed
templates. Instead: one **blueprint** per technology (`harness/blueprints/`)
bound by four **contracts** (`harness/contracts/`). A composer
(`src/core/composer.ts`) assembles a valid combo and emits the runtime.

```
frontend   next · vue · angular
backend    next-api · springboot · quarkus · dotnet · flask · go
database   postgres · mysql · mongo · sqlite
golden     next + next-api + sqlite   (the only no-docker combo)
```

Testability is a contract, not an afterthought: integration tests run against
the **real database** via Testcontainers (PGlite for the monorepo).

## Multi-tool by design

`AGENTS.md` is the shared spine (read by Codex, OpenCode, IBM Bob); `CLAUDE.md`
is a one-line import of it; `.mcp.json` wires the RNC MCP server for Claude Code.
One canonical harness, rendered into each agent tool's dialect.

## Run it (dev)

```bash
npm install
npm run dev -- --help
npm run dev -- stack --golden
npm run dev -- stack --front vue --back quarkus --db postgres
npm run dev -- runtime up          # writes docker-compose.yaml
```

## Status

Working now: `init`, `analyze` (stub IR), `spec`, `clarify`, `stack` (composer +
validation), `runtime` (docker-compose generation), `doctor`.

Seams / next milestones:

1. **RNC MCP client** (`src/core/rnc.ts`) — replace the `analyze` stub with live
   `getModules/getRules/getModuleScreens/getSourceFile` calls.
2. **`rnc api`** — generate `openapi.yaml` from the functional spec.
3. **`rnc implement M<n>`** — render spec → chosen stack via blueprints, with
   Definition-of-Done + verification (Testcontainers).
4. **`rnc verify` / `rnc trace`** — run DoD checks; fail CI on code↔spec↔RNC drift.
5. **Persistence adapters** (backend × db) — the real, bounded work.
6. **Skills/agents** — `containerize`, `compose`, `ci-cd`, `deploy` (→ rnc.skalena.com).
