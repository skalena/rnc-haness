---
description: Modernize a legacy system from an RNC workspace, traceable to the original rules
argument-hint: "[workspace name] (optional — you'll be shown the list otherwise)"
---

Conduct a legacy modernization using the `rnc-modernize` skill.

$ARGUMENTS

Start by confirming the environment is usable, quietly:

```bash
rnc doctor 2>/dev/null || npx -y @skalena/rnc doctor
```

If `rnc` is not on the PATH, use `npx -y @skalena/rnc` in place of `rnc` for
every command from here on — do not ask the user to install anything first.

If it reports no credential, run `/rnc-login` before continuing.

Then follow the `rnc-modernize` skill. Do not ask the user to type a workspace
id: list what their token can reach and let them choose.
