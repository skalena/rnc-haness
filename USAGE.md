# Using the RNC harness

Turns a legacy system analyzed in **RNC** into a modern application whose every
business rule traces back to the rule it came from.

**Your agent is the front door. The `rnc` CLI is the engine.** You talk to
Claude Code (or Codex, Cursor, OpenCode); it calls `rnc` for the parts that must
be deterministic. You should rarely type an `rnc` command yourself.

---

## Quick start — Claude Code plugin

```
/plugin marketplace add skalena/rnc-haness
/plugin install rnc@skalena
/rnc-login
```

```
> moderniza o legado do workspace MasterApp Delphi
```

That is the whole setup. The plugin ships the skills, the slash commands, the
RNC MCP server and a session hook; the engine runs through `npx`, so there is
nothing to install globally. The agent lists your workspaces, asks which one,
extracts the rules, brings you what is ambiguous, proposes an architecture,
builds milestone by milestone and verifies.

`/rnc-login` will offer to add this to your shell profile — it is what lets the
**MCP tools** (module-level zoom) connect in later sessions. The CLI itself
works without it:

```bash
export RNC_TOKEN=$(npx -y @skalena/rnc mcp token)
```

### Other agents

Codex, Cursor, OpenCode and 70+ more, via
[`skills`](https://github.com/vercel-labs/skills):

```bash
npx skills@latest add skalena/rnc-haness
```

### Engine only

```bash
npm i -g @skalena/rnc
rnc mcp login
rnc install          # skills → .claude/skills (--global for every project)
```

Requires Node ≥ 20.12.

## Slash commands

| Command | Does |
|---|---|
| `/rnc-modernize [workspace]` | conducts the whole modernization |
| `/rnc-login` | authenticates, and sets up the MCP token |
| `/rnc-status` | auth, bound workspace, milestone progress, drift |

---

## The skills

| Skill | Invoked by | Role |
|---|---|---|
| `rnc-modernize` | **you** — "moderniza meu legado", or `/rnc-modernize` | conducts the flow end to end |
| `rnc-provenance` | the agent, on its own | porting a rule auditably: every invariant cites its `BR-NNN`; uncertainty is marked, not guessed |
| `rnc-guardrails` | the agent, on its own | traps already paid for: money as float, build that needs a database, endpoint reachable without auth, stock race, silently zeroed counters |
| `rnc-verify` | the agent, on its own | run the command instead of claiming; prove the value, not the status |

Only the first is yours to invoke. The others are disciplines the agent reaches
for when the context calls for them.

---

## What the agent does for you

Each phase below is something the agent runs. They are listed so you can follow
along, override a decision, or drive it by hand when you want to.

### 1. Pick the legacy

```bash
rnc workspaces          # list, then choose the one to work with
rnc workspaces --list   # list only
```

Workspace ids are UUIDs and names have no slug, so nothing makes you type one.

### 2. Extract — deterministic

```bash
rnc analyze     # RNC → IR at .rnc/analysis.json  (--pick to choose from the list)
rnc spec        # → docs/functional/, stack-neutral
```

Every module carrying rules is read (SAFO: 79 modules, 1699 rules, ~3s). This is
not sampled: losing a business rule is the failure the harness exists to
prevent. `--sample N` exists but reports what it dropped.

`docs/functional/` is the source of truth and survives any stack change:

```
00-vision.md         scope
01-features.md       user stories
02-domain-rules.md   INV-NN invariants ← BR-NNN legacy rules
03-flows.md          screens, or jobs when the legacy is batch
06-traceability.md   build order + points to confirm
```

### 3. The clarify gate

```bash
rnc clarify
```

Everything RNC could **not** resolve on its own: ambiguous rule, discarded
source, low-confidence binding. High-impact items block code generation until
answered — a gate the agent can waive is not a gate. What stays unanswered
becomes an explicit `[PRESUMIDO]` in the code and in traceability, never a
silent assumption.

### 4. The API contract

```bash
rnc api gen      # deterministic skeleton from the IR
rnc api check    # external referee, exits 1
```

`openapi.yaml` is **the** seam — the frontend client, backend stubs, contract
tests, mocks and docs all derive from it. An LLM does not emit the same file
twice, so the skeleton is owned by `rnc`:

| Part | Who |
|---|---|
| entity schemas, error schema, CRUD paths, security | **rnc** (mechanical, reproducible) |
| semantic operations, custom shapes, real `examples` | **the agent**, inside the `x-rnc-agent-fill` points |
| validation | **rnc** — the author is never the judge |

`api check` catches broken `$ref`s, duplicate `operationId`s, money typed as a
float, orphan schemas and missing fail-closed responses.

### 5. Target architecture

```bash
rnc stack --golden                                  # Next monorepo + SQLite, no docker
rnc stack --front vue --back quarkus --db postgres  # polyglot
rnc runtime up                                      # writes docker-compose.yaml
```

| Layer | Options |
|---|---|
| frontend | `next` · `vue` · `angular` |
| backend | `next-api` · `springboot` · `quarkus` · `dotnet` · `flask` · `go` |
| database | `postgres` · `mysql` · `mongo` · `sqlite` |

Combos are validated (a backend with no adapter for a database is rejected).
Everything except the golden path gets a generated `docker-compose.yaml` with
healthchecks chained `db → backend → frontend`.

### 6. Build

```bash
rnc implement --list    # the milestone ladder, derived from the IR + stack
```

Inside a session the agent implements the milestone itself. `rnc implement M1`
spawns a **headless** agent instead — that is the outside-in mode for CI/batch,
and calling it from inside a session would recurse.

### 7. Verify

```bash
rnc verify          # project gates + trace + the milestone's Definition of Done
rnc trace --check   # drift: code ↔ spec ↔ RNC, exits 1
```

`trace` is deterministic, no LLM. It flags a spec invariant citing a BR absent
from the IR, code referencing an `INV-NN` missing from the spec, leftover
`[PRESUMIDO]` markers, and unresolved high-impact unknowns. Wire it into CI.

---

## Authentication

```bash
rnc mcp login              # device pairing, or a pasted token (masked input)
rnc mcp login --token <t>  # non-interactive; also reads $RNC_TOKEN
rnc mcp whoami             # identity + visible workspaces
rnc mcp token              # print the token, e.g. export RNC_TOKEN=$(rnc mcp token)
rnc mcp status             # local credential state
rnc mcp logout             # forget locally — does NOT revoke server-side
```

The token is validated before being stored, kept at `~/.rnc/credentials.json`
(mode `0600`, keyed by base URL), with the expiry read from the token itself.
Real revocation is in the web app: **Settings → MCP Access → Connected clients**.

| Setting | Env var | Default |
|---|---|---|
| RNC API base URL | `RNC_BASE_URL` | `https://api.rnc.skalena.co` |
| Credential / config home | `RNC_CONFIG_HOME` | `~/.rnc` |

---

## Two ways in

**Agent → rnc** (interactive, the normal path): the agent runs `rnc` as
deterministic tools and as a referee over its own output.

**rnc → agent** (CI/batch): `rnc implement M1` derives the milestone and spawns
Claude Code headless inside the scaffold it wired.

Same binary, opposite directions. The generated `AGENTS.md` says which applies
where, and forbids the recursive case.

---

## Project scaffold

```bash
rnc init [name]     # docs skeleton, AGENTS.md (+ thin CLAUDE.md), .mcp.json
rnc doctor          # environment, auth, blueprints, project state
```

`AGENTS.md` is the shared spine — Codex, OpenCode and others read it natively;
`CLAUDE.md` is a one-line import of it. `.mcp.json` wires the RNC MCP server
(SSE) with the base URL written literally and only the token as an env var, so
the file is safe to commit.

MCP tools for zooming into a module while coding: `getModuleRules`,
`getModuleDataModel`, `getUirModule`, `getModuleScreens`.

---

## Status

Working: skills (`rnc install`), `mcp login/logout/whoami/status/token`,
`workspaces`, `config`, `init`, `analyze` (live RNC, full extraction), `spec`,
`clarify`, `api gen/check`, `stack`, `runtime`, `implement`, `verify`, `trace`,
`doctor`, `add <codex|kiro|opencode>`.

Verified against real workspaces in two different legacy languages — Java (SAFO,
79 modules) and NATURAL (SIFAP) — which is the legacy-neutral claim actually
exercised rather than asserted.

Next: the crossing phase (data migration, cutover, parallel-run), which is
deliberately out of scope today — see the README.
