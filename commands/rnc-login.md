---
description: Connect to RNC and choose the workspace to work with
---

Connect to RNC and leave the user with a workspace selected.

## 1. Authenticate, if needed

```bash
rnc mcp status 2>/dev/null || npx -y @skalena/rnc mcp status
```

If it reports a valid credential, skip to step 2 — do not re-authenticate.

Otherwise run the login. It uses device pairing where available, and otherwise
prompts for a token from the web app with masked input:

```bash
rnc mcp login
```

Never ask the user to paste a token into the chat, and never echo one back.

## 2. Choose the workspace — always ask

```bash
rnc workspaces --list
```

Present the workspaces with **`AskUserQuestion`**, one option per workspace,
labelled with the name and described with language, module count and status.
Ask even when a default is already set — say which one is current, and let them
confirm or switch. Never make them type a UUID.

Do not offer this as a prompt in the CLI: you are running it over a pipe, so an
interactive prompt cannot work. You ask; the CLI records.

Then record the choice:

```bash
rnc config set workspace "<name>"
```

## 3. Report

State who they are authenticated as and which workspace is now selected, with
its size. Then offer the obvious next step: `/rnc-modernize` to start, or
`/rnc-status` if the directory is already a harness project.

If the `rnc` MCP tools are not connected in this session, mention once that the
server picks up the credential when Claude Code next starts — the CLI works now
regardless, so the work can begin immediately; only module-level zoom waits.
Do not tell them to edit a shell profile: authentication flows from the
credential store through `rnc mcp proxy`.
