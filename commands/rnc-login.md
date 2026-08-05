---
description: Authenticate the RNC harness against the RNC platform
---

Authenticate against RNC.

Run the interactive login — it uses device pairing when the deployment offers
it, and otherwise prompts for a token generated in the web app, with masked
input so the token never reaches the screen or shell history:

```bash
rnc mcp login 2>/dev/null || npx -y @skalena/rnc mcp login
```

Never ask the user to paste their token into the chat, and never echo a token
back — the CLI reads it directly and stores it at `~/.rnc/credentials.json`
(mode 0600).

Once it succeeds, confirm what the token can see:

```bash
rnc mcp whoami
```

Then tell the user this, so the MCP tools work in future sessions — the
`rnc` MCP server reads `RNC_TOKEN` from the environment, which Claude Code
resolves at startup:

```bash
echo 'export RNC_TOKEN=$(npx -y @skalena/rnc mcp token 2>/dev/null)' >> ~/.zshrc
```

Explain that they need to restart Claude Code once for the MCP server to pick
the token up. The `rnc` CLI itself works immediately — only the MCP tools
(module-level zoom) need the environment variable.
