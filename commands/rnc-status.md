---
description: Show RNC harness status — auth, workspaces, project state, drift
---

Report the state of this project's modernization. Run these and summarize; do
not dump raw output the user did not ask for.

```bash
rnc doctor
rnc workspaces --list
```

If this directory is already a harness project (`.rnc/analysis.json` exists),
also report progress and drift:

```bash
rnc implement --list
rnc trace
```

Summarize in this order: authentication, which workspace this project is bound
to, how far the milestones got, and any drift or unresolved `clarify` points.
Lead with anything that blocks progress. If `trace` reports errors, show them —
they mean code, spec and RNC disagree.
