import { z } from 'zod';
import { AuthError } from './rnc.js';

/**
 * RNC REST client — the fallback identity path only.
 *
 * `/api/v1/**` is out of reach for an `mcp`-scoped token (403 by design; the scope allows `/sse`,
 * `/mcp/message` and `/mcp/whoami` and nothing else), so all analysis reads go through MCP — see
 * `rncMcp.ts`. What remains here serves one case: a deployment that predates `/mcp/whoami` and
 * answers 404 to it, where the caller holds an unscoped token. See `whoamiViaRest` in `rnc.ts`.
 *
 * A 403 here is therefore never a bug to route around: it means a scoped token reached REST, and
 * the fix is to call the MCP tool instead.
 */

async function get(base: string, path: string, token: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new AuthError('token expired or revoked — check the RNC token');
  if (res.status === 403) throw new Error(`403 scope — token cannot reach ${path}`);
  if (res.status === 404) throw new Error(`404 — ${path} not found on this deployment`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

export const Profile = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
});

const Stats = z
  .object({
    totalFiles: z.number().optional(),
    totalModules: z.number().optional(),
    totalScreens: z.number().optional(),
    totalRules: z.number().optional(),
    languageBreakdown: z.record(z.number()).optional(),
  })
  .partial();

// Fields the API may legitimately send as null (workspace still ingesting, or
// no datastore detected) — nullish, not just optional.
export const WorkspaceFull = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  sourceRetention: z.string().nullish(),
  stats: Stats.nullish(),
  datastore: z
    .object({ vendor: z.string().nullish(), label: z.string().nullish(), dialect: z.string().nullish() })
    .partial()
    .nullish(),
});
export type WorkspaceFull = z.infer<typeof WorkspaceFull>;

export async function getProfile(base: string, token: string) {
  return Profile.parse(await get(base, '/api/v1/profile', token));
}

export async function listWorkspaces(base: string, token: string): Promise<WorkspaceFull[]> {
  return z.array(WorkspaceFull).parse(await get(base, '/api/v1/workspaces', token));
}
