---
description: Authenticate the RNC harness against the RNC platform
---

Authenticate against RNC.

First check whether it is even needed:

```bash
rnc mcp status 2>/dev/null || npx -y @skalena/rnc mcp status
```

If it reports a valid credential, say so and stop — do not re-authenticate.

Otherwise run the interactive login. It uses device pairing when the deployment
offers it, and otherwise prompts for a token generated in the web app, with
masked input so the token never reaches the screen or the shell history:

```bash
rnc mcp login
```

Never ask the user to paste a token into the chat, and never echo one back.

Once it succeeds, report who they are and which workspaces the token reaches:

```bash
rnc mcp whoami
```

## About the MCP tools

The credential store is all the MCP server needs — it authenticates through
`rnc mcp proxy`, so there is no token to export and nothing to add to a shell
profile. Do not instruct the user to edit `~/.zshrc`.

If the `rnc` MCP tools are not connected in this session, tell them plainly:
the server picks up the new credential when Claude Code next starts. The CLI
itself works immediately, so the modernization can begin right now — only
module-level zoom waits for the restart.
