---
description: Connect to RNC and choose the workspace to work with
---

Connect to RNC and leave the user with a workspace selected.

## 1. Check first

```bash
rnc mcp status 2>/dev/null || npx -y @skalena/rnc mcp status
```

Valid credential → skip to step 2. Expired or missing → step 1b.

## 1b. Get a token in place — inside Claude Code

Tell the user to run **`/plugin`**, open the `rnc` plugin and set **RNC token**.
The dialog masks the input and stores the value in the OS keychain — it never
touches `settings.json`, the conversation or the logs. Tokens are generated in
the RNC web app under **Settings → MCP Access**.

The session hook mirrors that token into the CLI's credential store on the next
start, so `rnc` commands and the MCP tools both work from that one setting.

**Never ask the user to paste a token into the chat.** It would become part of
the conversation, the context and the logs; a token pasted there must be treated
as compromised and rotated. If they insist, say that plainly first.

If they would rather use the terminal, both of these work and keep the token
masked or out of shell history:

```bash
npx -y @skalena/rnc mcp login
pbpaste | npx -y @skalena/rnc mcp login --stdin
```

Either way, Claude Code has to restart once for the MCP server to pick the token
up. Confirm with `rnc mcp status` afterwards.

## 2. Choose the workspace — always ask

```bash
rnc workspaces --list
```

Present them with **`AskUserQuestion`**, one option per workspace, labelled with
the name and described with language, module count and status. Ask even when a
default exists — say which is current, and let them confirm or switch. Never
make them type a UUID.

Record the answer:

```bash
rnc config set workspace "<name>"
```

## 3. Report

Say who they are authenticated as and which workspace is selected, with its
size. Offer the next step: `/rnc-modernize` to start, or `/rnc-status` if this
directory is already a harness project.

The MCP server reads the credential store through `rnc mcp proxy` — nothing to
export, no shell profile to edit. If the `rnc` MCP tools are not connected in
this session, mention once that they come up when Claude Code next starts; the
CLI works now regardless, so the work can begin immediately.
