# Contracts — the seams that make any combo valid

The harness does not store N×M×K stack templates. It stores technology
**blueprints** (fragments) bound by four **contracts**. The composer assembles a
valid combo from them. Adding a technology = adding a blueprint; the contracts
are what let a Vue frontend talk to a Quarkus backend on Mongo exactly as a Next
frontend talks to a Flask backend on Postgres.

## 1. API contract — `api/openapi.yaml`

Single source of truth for the wire. Generated from `docs/functional/` (features
+ invariants). Everything derives from it:

- frontend client (openapi-typescript · orval · ng-openapi-gen)
- backend server stubs (openapi-generator) — or code-first + CI diff against this file
- contract tests (Schemathesis / Dredd) using the `examples` as fixtures
- a mock server (Prism) so the frontend runs before the backend exists
- interactive docs (Scalar / Redoc) served at `/docs`

Rule: **openapi.yaml is authoritative.** `rnc trace --check` fails CI on any drift
between code and the contract.

## 2. Persistence contract — `Repository<Entity>`

The domain layer depends on a repository interface per entity; the database
blueprint implements it. This is the `backend × database` adapter (15 pairs).
The domain never knows which database is behind the interface.

| backend | postgres/mysql | mongo |
|---|---|---|
| Spring Boot / Quarkus | JPA + Flyway | Spring/Panache Mongo |
| .NET | EF Core + migrations | MongoDB.Driver |
| Flask | SQLAlchemy + Alembic | Beanie/PyMongo |
| Go | sqlc/GORM + golang-migrate | mongo-go-driver |
| Next API | Drizzle | — |

## 3. Test contract — testability is not optional

Every layer ships tests; contract tests sit on the seams.

- frontend: component (Vitest/Jest) + e2e (Playwright)
- backend: unit + integration against the **real database** via Testcontainers
  (dockertest for Go, PGlite for the Next monorepo)
- seam: contract-test generated from OpenAPI
- domain: concurrency test for stock/ledger invariants

## 4. Runtime contract — one compose service per blueprint

Each blueprint declares its container service (image/build, ports, env,
healthcheck, depends_on). The composer concatenates them into
`docker-compose.yaml`. The **only** exception is the golden path
(Next.js monorepo + SQLite): one process, one `.db` file, no docker.
