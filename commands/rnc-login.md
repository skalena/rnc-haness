---
description: Connect to RNC and choose the workspace to work with
---

Connect to RNC and leave the user with a workspace selected.

## 1. Check first

```bash
rnc mcp status 2>/dev/null || npx -y @skalena/rnc mcp status
```

Valid credential → skip to step 2. Expired or missing → step 1b.

## 1b. Get a token in place

You are running the CLI over a pipe, so its masked prompt cannot run here.

**Never ask the user to paste a token into the chat.** It would become part of
the conversation, the context and the logs — a token pasted into chat should be
treated as compromised and rotated. Ask them to run one command in their own
terminal instead, where the input is masked:

```bash
npx -y @skalena/rnc mcp login
```

If they already have the token on the clipboard, this keeps it out of shell
history too:

```bash
pbpaste | npx -y @skalena/rnc mcp login --stdin
```

Tokens are generated in the RNC web app under **Settings → MCP Access**.

Wait for them to say it is done, then re-run `rnc mcp status` to confirm. If the
user insists on pasting into the chat, tell them plainly that the token will be
exposed and must be rotated afterwards — then proceed with
`rnc mcp login --token <t>` if they still want to.

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
