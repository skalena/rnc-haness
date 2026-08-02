import * as p from '@clack/prompts';
import pc from 'picocolors';
import { whoami, type Workspace } from './rnc.js';

/**
 * Interactive workspace picker. Workspace ids are UUIDs and names are free text
 * with no slug, so making the user type either is bad UX — list what the token
 * can actually see and let them choose.
 *
 * `modules` is shown because the same application is often ingested more than
 * once; without it a list of same-named workspaces is unreadable.
 */
export async function pickWorkspace(base: string, token: string, message = 'Workspace RNC'): Promise<Workspace> {
  const me = await whoami(base, token);
  if (me.workspaces.length === 0) {
    p.cancel('nenhum workspace visível para este tenant');
    process.exit(1);
  }
  if (me.workspaces.length === 1) return me.workspaces[0]!;

  const ready = [...me.workspaces].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'READY' ? -1 : 1;
    return b.modules - a.modules;
  });

  const choice = await p.select({
    message,
    options: ready.map((w) => ({
      value: w.id,
      label: w.name,
      hint: `${w.status === 'READY' ? w.status : pc.yellow(w.status)} · ${w.modules} módulos`,
    })),
  });
  if (p.isCancel(choice)) {
    p.cancel('cancelado');
    process.exit(0);
  }
  return ready.find((w) => w.id === choice)!;
}
