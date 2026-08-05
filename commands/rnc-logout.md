---
description: Disconnect from RNC — forget the local credential
---

Disconnect this machine from RNC.

```bash
rnc mcp logout 2>/dev/null || npx -y @skalena/rnc mcp logout
```

This deletes the local credential (`~/.rnc/credentials.json`) and clears the
selected workspace. Report both.

## Be clear about what this does not do

**The token stays valid on the server.** Local logout forgets it here; it does
not revoke it. If the user's concern is a leaked or shared token, say so
plainly and point them at the web app — **Settings → MCP Access → Connected
clients** — which is the only place a grant is actually revoked. Do not imply
the token is dead.

There is no CLI revocation endpoint by design: revoking is authenticated by a
session, and a token that could revoke itself would need a scope wide enough to
defeat the containment the MCP scope exists to provide.

## After logging out

The `rnc` MCP tools stop working on the next Claude Code start — the proxy
authenticates from the credential that no longer exists. `rnc` commands that
reach RNC will fail until `/rnc-login`. Files already produced
(`.rnc/analysis.json`, `docs/`) are untouched and remain usable offline.
