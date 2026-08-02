# Using `rnc`

The RNC Harness CLI turns a legacy system analyzed in **RNC** into a
spec-driven, testable, containerized modern application. The workflow is fixed
for every legacy (Delphi, COBOL, Java, VB6, NATURAL…); only the analysis data
and the chosen target stack change.

## Install

```bash
npm install -g @skalena/rnc
rnc --help
```

Or run without installing:

```bash
npx @skalena/rnc --help
```

Requires Node ≥ 20.12.

## Configuration

| Setting | Env var | Default |
|---|---|---|
| RNC API base URL | `RNC_BASE_URL` | `https://api.rnc.skalena.co` (hosted prod) |
| Credential / config home | `RNC_CONFIG_HOME` | `~/.rnc` |

Out of the box it targets the hosted platform. Override only for local/dev:

```bash
export RNC_BASE_URL=http://localhost:8080
```

## The workflow (fixed order)

```
login → analyze → spec → clarify → stack → runtime → (implement → verify → trace)
```

### 1. Authenticate

```bash
rnc mcp login
```

Device pairing: the CLI prints a URL and a code, you approve in the browser
(works for password and SSO/Keycloak accounts). The token is stored at
`~/.rnc/credentials.json` (mode `0600`), valid 90 days.

```bash
rnc mcp whoami     # identity + workspaces you can see
rnc mcp status     # local credential state
rnc mcp logout     # forget the token locally (does NOT revoke server-side)
```

To really revoke: web app → **Settings → MCP Access → Connected clients**.

### 2. Pick a workspace

```bash
rnc mcp whoami                          # list workspace names + ids
rnc config set workspace <name|id>      # name-prefix or UUID; sets the default
```

### 3. Analyze the legacy

```bash
rnc analyze --workspace <name|id>       # or just `rnc analyze` if a default is set
```

Validates the workspace is `READY`, then reads its modules, business rules,
data models and quality findings from RNC and normalizes them into a
legacy-neutral IR at `.rnc/analysis.json`. Build order is derived from
blast-radius (highest-impact module first).

### 4. Generate the functional spec

```bash
rnc spec
```

Writes `docs/functional/` — **stack-neutral** and the source of truth:

```
docs/functional/
  00-vision.md          scope, stack-neutral
  01-features.md        user stories
  02-domain-rules.md    INV-NN invariants ← BR-NNN legacy rules (traceable)
  03-flows.md           screens / jobs
  06-traceability.md    build order + points to confirm
```

### 5. Resolve the clarify gate

```bash
rnc clarify
```

Surfaces every rule RNC could not resolve automatically (ambiguous, needs human
review, incomplete, discarded source). High-impact items **block** the build
until answered or explicitly marked assumed.

### 6. Choose the target architecture

The spec is stack-neutral; this binds it to a concrete stack.

```bash
# simplest — Next.js monorepo + SQLite, no docker
rnc stack --golden

# or compose any combo
rnc stack --front vue     --back quarkus --db postgres
rnc stack --front angular --back dotnet  --db mysql
rnc stack --front next    --back go      --db mongo

# or interactively
rnc stack
```

| Layer | Options |
|---|---|
| frontend | `next` · `vue` · `angular` |
| backend | `next-api` · `springboot` · `quarkus` · `dotnet` · `flask` · `go` |
| database | `postgres` · `mysql` · `mongo` · `sqlite` |

Invalid combos (e.g. a backend with no adapter for a database) are rejected with
a clear message. The choice is saved to `.rnc/stack.json`.

### 7. Generate the runtime

```bash
rnc runtime up
```

- **Golden path** (Next + SQLite): no docker — one process, one `.db` file.
- **Everything else**: writes a `docker-compose.yaml` assembled from the
  blueprints, with healthchecks and `depends_on` chained `db → backend → frontend`.

```bash
docker compose up --wait
```

## Doctor

```bash
rnc doctor
```

Checks Node, blueprints, RNC auth, project state and detected agent tools.

## Multi-tool agents

`rnc init` also writes:

- `AGENTS.md` — shared agent rules (read by Codex, OpenCode, IBM Bob)
- `CLAUDE.md` — a one-line import of `AGENTS.md`
- `.mcp.json` — wires the RNC MCP server (SSE) for Claude Code

The same token drives Claude Code directly:

```bash
claude mcp add rnc --transport sse "$RNC_BASE_URL/sse" \
  --header "Authorization: Bearer $RNC_TOKEN"
```

## End-to-end example

```bash
export RNC_BASE_URL=https://api.rnc.skalena.co
rnc mcp login
rnc config set workspace SAFO
rnc analyze
rnc spec
rnc clarify
rnc stack --front vue --back quarkus --db postgres
rnc runtime up
docker compose up --wait
```

## Status

Working: `mcp login/logout/whoami/status`, `config`, `analyze` (live RNC REST),
`spec`, `clarify`, `stack`, `runtime`, `doctor`, `init`.

In progress: full module extraction (currently samples the richest modules),
`rnc api` (OpenAPI generation), `rnc implement/verify/trace`, and the per-stack
persistence adapters. See the README for the roadmap.
