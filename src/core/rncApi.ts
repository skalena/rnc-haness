import { z } from 'zod';
import { AuthError } from './rnc.js';

/**
 * RNC REST client — the *actual* prod deployment (https://api.rnc.skalena.co).
 *
 * The integration doc describes a scope-restricted `/mcp/whoami` variant; this
 * deployment exposes the standard `/api/v1/**` surface, paginated Spring-style.
 * We probed it live and mapped these shapes from real responses.
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

export const WorkspaceFull = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  sourceRetention: z.string().optional(),
  stats: Stats.optional(),
  datastore: z
    .object({ vendor: z.string().optional(), label: z.string().optional(), dialect: z.string().optional() })
    .partial()
    .optional(),
});
export type WorkspaceFull = z.infer<typeof WorkspaceFull>;

export const ModuleSummary = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  language: z.string().optional(),
  screenCount: z.number().default(0),
  ruleCount: z.number().default(0),
  fieldCount: z.number().default(0),
});
export type ModuleSummary = z.infer<typeof ModuleSummary>;

export const BusinessRule = z.object({
  id: z.string(),
  description: z.string().optional(),
  condition: z.string().optional(),
  severity: z.string().optional(),
  candidateType: z.string().optional(),
  isUnambiguous: z.boolean().optional(),
  requiresHumanReview: z.boolean().optional(),
  completeness: z.string().optional(),
  semanticKind: z.string().optional(),
});

export const ModuleDetail = z.object({
  id: z.string(),
  name: z.string(),
  businessRules: z.array(BusinessRule).default([]),
  dataModels: z
    .array(z.object({ name: z.string().optional(), physicalName: z.string().optional(), fields: z.array(z.any()).optional() }))
    .default([]),
  persistence: z.object({ entities: z.array(z.string()).optional() }).partial().nullable().optional(),
  qualityFindings: z.array(z.object({ severity: z.string().optional() })).default([]),
  securityFindings: z.array(z.any()).default([]),
});
export type ModuleDetail = z.infer<typeof ModuleDetail>;

export async function getProfile(base: string, token: string) {
  return Profile.parse(await get(base, '/api/v1/profile', token));
}

export async function listWorkspaces(base: string, token: string): Promise<WorkspaceFull[]> {
  return z.array(WorkspaceFull).parse(await get(base, '/api/v1/workspaces', token));
}

export async function getWorkspace(base: string, token: string, id: string): Promise<WorkspaceFull> {
  return WorkspaceFull.parse(await get(base, `/api/v1/workspaces/${id}`, token));
}

/** Fetch every module summary (walks Spring pages). */
export async function listModules(base: string, token: string, wsId: string): Promise<ModuleSummary[]> {
  const first = (await get(base, `/api/v1/workspaces/${wsId}/modules?page=0&size=200`, token)) as {
    content: unknown[];
    totalPages: number;
  };
  const out = z.array(ModuleSummary).parse(first.content);
  for (let p = 1; p < (first.totalPages ?? 1); p++) {
    const page = (await get(base, `/api/v1/workspaces/${wsId}/modules?page=${p}&size=200`, token)) as { content: unknown[] };
    out.push(...z.array(ModuleSummary).parse(page.content));
  }
  return out;
}

export async function getModule(base: string, token: string, wsId: string, modId: string): Promise<ModuleDetail> {
  return ModuleDetail.parse(await get(base, `/api/v1/workspaces/${wsId}/modules/${modId}`, token));
}
