# Connecting the RNC Harness to RNC

How `rnc mcp login` obtains a credential from the RNC platform, and how the harness uses it to talk
to the RNC MCP server.

This is the wire contract. It reflects what the RNC backend actually implements — endpoint paths,
JSON field names, status codes and error strings are exact.

---

## 1. What the harness needs

Two things, in this order:

1. **A token.** Obtained once, interactively, by device pairing. Stored on disk. Valid 90 days.
2. **An MCP session.** SSE transport, the token in an `Authorization` header.

The token is deliberately narrow: it reaches the MCP transport and one introspection endpoint, and
**nothing else in the RNC API**. See [§6](#6-what-the-token-can-and-cannot-do) — that constraint
changes how the harness must handle a `403`.

### Why device pairing and not a password

RNC runs Keycloak SSO. A large share of users have no local password at all, so there is nothing to
type into a terminal. Pairing rides the browser session the user already has, which works
identically for password and SSO accounts.

---

## 2. Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/cli/pair` | public | start pairing, get device + user code |
| `POST` | `/auth/cli/token` | public | poll until approved, receive the token |
| `GET`  | `/mcp/whoami` | Bearer | who am I, which workspaces can I see |
| `GET`  | `/sse` | Bearer | MCP transport — event stream |
| `POST` | `/mcp/message` | Bearer | MCP transport — client → server |

Base URL is the **API**, not the web app: `http://localhost:8080` in dev. Take it from
`RNC_BASE_URL` or `--base-url`, defaulting to localhost.

The public endpoints are safe unauthenticated. `/auth/cli/pair` creates only a *pending* request,
worthless until a human approves it in a logged-in session, and the approving session is the only
thing that decides whose identity the CLI receives.

---

## 3. The flow

### 3.1 Start pairing

```http
POST {base}/auth/cli/pair
Content-Type: application/json

{"clientName": "RNC-Harness 0.1.0 (macbook-edgar)"}
```

**`201 Created`**

```json
{
  "deviceCode": "sM3k9…32-random-bytes-base64url…",
  "userCode": "K7M4-P2QX",
  "verificationUri": "http://localhost:3000/device",
  "verificationUriComplete": "http://localhost:3000/device?code=K7M4-P2QX",
  "expiresIn": 600,
  "interval": 5
}
```

- `clientName` is shown on the approval screen. Send something that identifies the machine — it is
  the only signal a user has to recognise a pairing that is not theirs. Body is optional; omitting
  it yields `"Unnamed CLI"`.
- **Print `verificationUriComplete` as returned.** Never build the URL yourself: it comes from the
  backend's `FRONTEND_URL`, so it is already correct per environment.
- `userCode` uses an alphabet without `I O 0 1`. Print it verbatim, spaced or boxed so it is easy to
  read aloud.
- `deviceCode` is the secret. Keep it in memory, never log it, never print it.

### 3.2 The user approves

They open the URI and confirm. Nothing for the harness to do but poll.

### 3.3 Poll for the token

```http
POST {base}/auth/cli/token
Content-Type: application/json

{"deviceCode": "sM3k9…"}
```

**`200 OK`** — done:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9…",
  "tokenType": "Bearer",
  "expiresAt": "2027-01-29T20:14:07.221Z",
  "subject": "edgar@skalena.com"
}
```

**`400 Bad Request`** — everything else:

```json
{"error": "authorization_pending"}
```

| `error` | meaning | harness action |
|---|---|---|
| `authorization_pending` | not approved yet | wait `interval` seconds, poll again |
| `slow_down` | polled less than 5 s after the previous poll | add 5 s to the interval, poll again |
| `access_denied` | the user pressed Deny | abort, do not retry |
| `expired_token` | expired, already used, or unknown device code | abort, tell the user to run login again |

Three things that will bite:

- **Never poll faster than `interval`.** The window is measured against the *previous poll*, not
  against the start.
- **`expired_token` also covers an unknown device code.** That is deliberate — a caller guessing
  codes learns nothing about which ones existed. Do not treat it as a transport bug.
- **A device code is single use.** Once it produced a token it is spent; a second poll returns
  `expired_token`.

Timestamps are ISO-8601 UTC. Do not depend on sub-second precision.

### 3.4 Identify

```http
GET {base}/mcp/whoami
Authorization: Bearer {accessToken}
```

```json
{
  "subject": "edgar@skalena.com",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "role": "TENANT_ADMIN",
  "platformAdmin": false,
  "workspaces": [
    {"id": "a2e03ef7-d790-406a-9a6f-ff6b744391e2", "name": "SAFO",    "status": "READY", "modules": 79},
    {"id": "11f670df-5128-4da2-9db2-d38e5954dd2c", "name": "SER",     "status": "READY", "modules": 178},
    {"id": "384c64e9-1379-44fd-9144-f7b8925ee4b4", "name": "MastApp", "status": "READY", "modules": 36}
  ]
}
```

This is why `whoami` exists: a scoped token cannot call `/api/v1/workspaces`, so without it the
harness would have to run a full MCP handshake just to print a workspace list — making an auth
failure indistinguishable from a transport failure.

**There is no slug.** Workspace names are free text (`"SAFO - App2"`, `"Bombeiros Java"`,
`"PUCMG- EGR"`). Match on case-insensitive name prefix and accept a UUID. A slug would be an
identifier people come to depend on; that is a schema decision, not something an auth endpoint
should invent.

`modules` is included because several workspaces can be the same application ingested more than
once. Show it — a list of five 79-module workspaces is otherwise unreadable.

---

## 4. Reference implementation

Node 20+ has global `fetch`. Matches the harness's existing dependencies (`zod`, `@clack/prompts`,
`picocolors`).

```ts
import { z } from 'zod'

const PairingStart = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  verificationUriComplete: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
})

const TokenGrant = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.string(),
  subject: z.string(),
})

const WhoAmI = z.object({
  subject: z.string(),
  tenantId: z.string().nullable(),
  role: z.string().nullable(),
  platformAdmin: z.boolean(),
  workspaces: z.array(z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    modules: z.number(),
  })),
})

export class PairingError extends Error {
  constructor(readonly code: 'access_denied' | 'expired_token' | 'timeout') {
    super(code)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function startPairing(base: string, clientName: string) {
  const res = await fetch(`${base}/auth/cli/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName }),
  })
  if (!res.ok) throw new Error(`pair failed: HTTP ${res.status}`)
  return PairingStart.parse(await res.json())
}

export async function awaitApproval(
  base: string,
  deviceCode: string,
  startInterval: number,
  expiresIn: number,
) {
  let interval = startInterval
  const deadline = Date.now() + expiresIn * 1000

  while (Date.now() < deadline) {
    await sleep(interval * 1000)

    const res = await fetch(`${base}/auth/cli/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    })

    if (res.ok) return TokenGrant.parse(await res.json())

    const { error } = (await res.json().catch(() => ({}))) as { error?: string }
    switch (error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        interval += 5      // RFC 8628: back off, do not give up
        break
      case 'access_denied':
      case 'expired_token':
        throw new PairingError(error)
      default:
        throw new Error(`unexpected pairing response: HTTP ${res.status} ${error ?? ''}`)
    }
  }
  throw new PairingError('timeout')
}

export async function whoami(base: string, token: string) {
  const res = await fetch(`${base}/mcp/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('token expired or revoked — run `rnc mcp login`')
  if (!res.ok) throw new Error(`whoami failed: HTTP ${res.status}`)
  return WhoAmI.parse(await res.json())
}
```

Wiring the command (`@clack/prompts` for the spinner):

```ts
import * as p from '@clack/prompts'
import pc from 'picocolors'

export async function login(base: string) {
  p.intro(pc.bold('Login RNC'))

  const pairing = await startPairing(base, `RNC-Harness ${VERSION} (${os.hostname()})`)

  p.note(
    `${pc.underline(pairing.verificationUriComplete)}\n\ncódigo:  ${pc.bold(pairing.userCode)}`,
    'Abra no navegador e informe o código',
  )

  const s = p.spinner()
  s.start('aguardando autorização…')
  const grant = await awaitApproval(base, pairing.deviceCode, pairing.interval, pairing.expiresIn)
  s.stop(`autenticado como ${grant.subject}`)

  await saveCredentials({ baseUrl: base, ...grant })

  const me = await whoami(base, grant.accessToken)
  p.log.success(`token salvo · workspaces: ${me.workspaces.map((w) => w.name).join(', ')}`)

  const preferred = me.workspaces[0]
  if (preferred) {
    await setDefaultWorkspace(preferred.id)
    p.outro(`padrão definido: ${preferred.name}   (mudar: rnc config set workspace <nome>)`)
  }
}
```

---

## 5. Storing the credential

```
~/.rnc/credentials.json     mode 0600     (directory 0700)
```

```json
{
  "baseUrl": "http://localhost:8080",
  "accessToken": "eyJhbGciOiJIUzI1NiJ9…",
  "expiresAt": "2027-01-29T20:14:07.221Z",
  "subject": "edgar@skalena.com",
  "clientName": "RNC-Harness 0.1.0 (macbook-edgar)"
}
```

Rules:

- Write with `{ mode: 0o600 }` and create the directory with `0o700`. Do not rely on umask.
- **Never log the token**, not even under `--verbose` or `DEBUG`. Redact to a prefix if you must
  show something.
- **Never put it in a query string.** It would land in the reverse-proxy access log, in browser
  history and in `Referer` headers.
- One entry per `baseUrl` if you plan to support multiple environments; keying the file by
  environment beats overwriting a production token with a dev one.

---

## 6. What the token can and cannot do

Scope is `mcp`. Reachable:

```
GET  /sse
POST /mcp/message
GET  /mcp/whoami
```

Everything else in the API — including `/api/v1/workspaces`, `/api/v1/profile` and
`/api/v1/admin/**` — answers **`403`**. That is the containment guarantee, not a misconfiguration:
a 90-day credential living in a config file on a laptop should be able to do exactly one thing.

### Status-code handling — get this right

| Status | Meaning | Harness action |
|---|---|---|
| `401` | token expired (90 d) **or revoked** by the user | discard the credential, prompt `rnc mcp login` |
| `403` | scope — you called something an MCP token may not call | **fix the call**. Never re-login |
| `404` | wrong path, or a resource outside the caller's tenant | do not retry |

Treating `403` as "log in again" produces an infinite loop: the new token has exactly the same
scope. This is the single most likely integration bug.

Note also that RNC runs with `server.error.include-message=never` (the Spring Boot default), so the
`403` body carries no explanatory text. **Branch on the status code, never on the message.**

---

## 7. Using the MCP server

```
GET  {base}/sse            Authorization: Bearer {token}
POST {base}/mcp/message    Authorization: Bearer {token}
```

Transport is SSE (the only one Spring AI 1.0.0 ships). Every tool is read-only and tenant-scoped —
generation, chat and all write actions are intentionally not exposed over MCP.

Tools available:

| Area | Tools |
|---|---|
| Workspaces | `listWorkspaces`, `getWorkspaceOverview` |
| UIR | `listUirModules`, `getUirModule`, `getModuleScreens`, `getModuleRules`, `getModuleDataModel`, `searchModules` |
| Security | `getSecurityReport`, `getSecurityFindings`, `getDataMap`, `getAttackSurface` |
| Insights | `getExecutiveSummary`, `getUserStories`, `getTechDebt`, `listReports`, `getReport` |

No tool takes a token argument — identity comes from the request, and every call is scoped to the
caller's tenant.

For reference, the same token drives Claude Code:

```bash
claude mcp add rnc --transport sse {base}/sse --header "Authorization: Bearer {token}"
```

---

## 8. Logout and revocation

- **Local logout** (`rnc mcp logout`): delete `~/.rnc/credentials.json`. The token stays valid
  server-side — this only forgets it locally.
- **Real revocation**: the user opens **Settings → MCP Access → Connected clients** in the web app
  and revokes the grant. It stops working on the next request and returns `401`.

There is no CLI revocation endpoint: revoking is authenticated by a *session*, and a token that
could revoke itself would need a scope wide enough to defeat the containment above. Say this
plainly in `rnc mcp logout` output so nobody assumes the token is dead.

---

## 9. Configuration

| Setting | Env | Default |
|---|---|---|
| API base URL | `RNC_BASE_URL` | `http://localhost:8080` |
| Credential file | `RNC_CONFIG_HOME` | `~/.rnc` |

Do not make the web-app URL configurable in the harness — it arrives in `verificationUri` and is
already right for the environment.

---

## 10. Manual test

```bash
BASE=http://localhost:8080

PAIR=$(curl -s -X POST $BASE/auth/cli/pair \
  -H 'Content-Type: application/json' \
  -d '{"clientName":"RNC-Harness manual test"}')

DEVICE=$(echo "$PAIR" | jq -r .deviceCode)
echo "$PAIR" | jq -r '"Abra: \(.verificationUriComplete)\nCódigo: \(.userCode)"'

# approve in the browser, then:
while :; do
  R=$(curl -s -X POST $BASE/auth/cli/token \
        -H 'Content-Type: application/json' \
        -d "{\"deviceCode\":\"$DEVICE\"}")
  case "$(echo "$R" | jq -r '.error // "ok"')" in
    authorization_pending) sleep 5 ;;
    slow_down)             sleep 10 ;;
    ok)                    TOKEN=$(echo "$R" | jq -r .accessToken); break ;;
    *)                     echo "failed: $R"; exit 1 ;;
  esac
done

curl -s $BASE/mcp/whoami -H "Authorization: Bearer $TOKEN" | jq
curl -s -o /dev/null -w 'workspaces via API: %{http_code} (expected 403)\n' \
  $BASE/api/v1/workspaces -H "Authorization: Bearer $TOKEN"
```

The last line is the containment check. `403` means the token is correctly scoped.

---

## 11. Troubleshooting

| Symptom | Cause |
|---|---|
| `expired_token` on the first poll | polled after the 10-minute window, or the device code was mistyped/truncated |
| `slow_down` forever | polling loop is not honouring the interval; it is measured against the previous poll |
| `403` on every RNC call | using the MCP token against `/api/v1/**`. Correct — use the MCP tools |
| `401` on a token that worked yesterday | revoked in the web UI, or 90 days elapsed |
| Pairing page says "no pairing is waiting for that code" | code expired, was already used, or belongs to another environment's backend |
| `whoami` returns an empty `workspaces` array | the account's tenant genuinely has none — not an auth problem |

---

## Appendix — why the pieces are shaped this way

- **The pairing endpoint is public** because the caller has no credential yet. It is inert: only a
  human in an authenticated session can turn a pending request into a token, and the identity is
  snapshotted from *that* session. The CLI never chooses who it becomes.
- **The device code is stored hashed** (SHA-256). A leaked database row cannot be turned into a
  token. The user code is stored in the clear — it is meant to be read aloud, is useless without the
  paired device code, and dies in ten minutes.
- **`subject` comes back in the token response** so the harness never has to decode the credential.
  Treat the token as opaque; the day it stops being a JWT, nothing breaks.
- **Tokens are revocable** through a server-side grant registry, so a lost laptop does not mean
  rotating the platform signing secret and logging everyone out.
