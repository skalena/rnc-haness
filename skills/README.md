# RNC skills

Skills for modernizing a legacy system analyzed in RNC. They are the front door;
the `rnc` CLI is the engine underneath — it supplies deterministic facts and
judges the result, it does not own your process.

## Install

Editable copy (you own the files, customize freely):

```bash
npx skills@latest add skalena/rnc-haness
```

Works with Claude Code, Codex, Cursor, OpenCode and other agents supported by
[`skills`](https://github.com/vercel-labs/skills).

The engine:

```bash
npm i -g @skalena/rnc
rnc mcp login
```

## The skills

| Skill | Invocation | Role |
|---|---|---|
| `rnc-modernize` | **you** — "moderniza meu legado" / `/rnc-modernize` | conducts the whole flow: which workspace → extract → clarify gate → contract → architecture → build → verify |
| `rnc-provenance` | the agent, automatically | how to port a business rule auditably: every invariant cites its `BR-NNN`, uncertainty is marked rather than guessed |
| `rnc-guardrails` | the agent, automatically | expensive traps already paid for: money as float, build that needs a database, endpoint reachable without auth, stock race, silently zeroed counters |
| `rnc-verify` | the agent, automatically | run the command instead of claiming; prove the value, not the status; accept an external referee |

Only one is invoked by you. The rest are disciplines the agent reaches for when
the context calls for them — you should not have to remember them.

## Why a CLI *and* skills

The skills carry judgement: what to ask, what to build, in what order.

The CLI carries what an LLM cannot do twice the same way:

- **deterministic extraction** — 1699 business rules out of a real workspace, same input, same output
- **gates** — high-impact ambiguity blocks code generation; a gate the agent can waive is not a gate
- **an external referee** — `rnc trace --check` and `rnc api check` exit 1 on drift, and the author is not the judge

Neither half works alone: prompts cannot guarantee reproducibility, and a CLI
cannot conduct an interview or write a domain layer.

## Usage

```
claude
> moderniza o legado do workspace SIFAP
```

The agent lists your workspaces, asks which one, extracts, brings you the
ambiguous points, proposes an architecture, builds milestone by milestone and
verifies. You never type an `rnc` command yourself.
