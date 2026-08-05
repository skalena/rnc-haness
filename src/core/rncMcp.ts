import { z } from 'zod';
import { McpClient } from './mcpClient.js';

/**
 * Typed RNC tool calls over the MCP transport.
 *
 * The REST surface (`/api/v1/**`) is deliberately out of reach for an `mcp`-scoped token: the
 * scope allows exactly `/sse`, `/mcp/message` and `/mcp/whoami`, and everything else answers 403.
 * That containment is the feature — a 90-day CLI token used to reach `/api/v1/admin/**` — so the
 * harness reads legacy analysis through the same read-only tools an agent sees.
 *
 * Every schema here is nullish on anything the server may legitimately not know (a workspace still
 * ingesting, a driver that could not resolve a type). A null must never abort an extraction; a
 * dropped business rule is the one failure this harness exists to prevent.
 */

/** WorkspaceTools.WorkspaceOverview */
export const WorkspaceOverview = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  status: z.string(),
  uploadedFileName: z.string().nullish(),
  sourceRetention: z.string().nullish(),
  languageBreakdown: z.record(z.number()).nullish(),
  totalFiles: z.number().nullish(),
  totalModules: z.number().nullish(),
  totalScreens: z.number().nullish(),
  totalRules: z.number().nullish(),
  gitRepository: z.string().nullish(),
});
export type WorkspaceOverview = z.infer<typeof WorkspaceOverview>;

/** api.module.ModuleSummary, as returned inside UirTools.ModulePage */
export const ModuleSummary = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().nullish(),
  language: z.string().nullish(),
  sourceFilename: z.string().nullish(),
  screenCount: z.number().nullish().transform((v) => v ?? 0),
  ruleCount: z.number().nullish().transform((v) => v ?? 0),
  fieldCount: z.number().nullish().transform((v) => v ?? 0),
});
export type ModuleSummary = z.infer<typeof ModuleSummary>;

/**
 * UirTools.ModulePage. `hasMore` is the server telling us a cap was hit — the paging loop below
 * follows it rather than guessing from the page length, because a full page is not the same thing
 * as a truncated one.
 */
const ModulePage = z.object({
  items: z.array(ModuleSummary),
  page: z.number(),
  size: z.number(),
  totalModules: z.number(),
  totalPages: z.number(),
  hasMore: z.boolean(),
});

export const BusinessRule = z.object({
  id: z.string(),
  // Stable across re-ingestion, unlike `id` (BR-001 is only unique within its module and renumbers
  // whenever extraction changes). Empty on modules ingested before the field existed.
  ruleKey: z.string().nullish(),
  description: z.string().nullish(),
  condition: z.string().nullish(),
  severity: z.string().nullish(),
  candidateType: z.string().nullish(),
  isUnambiguous: z.boolean().nullish(),
  requiresHumanReview: z.boolean().nullish(),
  completeness: z.string().nullish(),
  semanticKind: z.string().nullish(),
});

/** The compiled UIR of one module, as returned by getUirModule. */
export const ModuleDetail = z.object({
  id: z.string(),
  name: z.string(),
  businessRules: z.array(BusinessRule).nullish().transform((v) => v ?? []),
  dataModels: z
    .array(
      z.object({
        name: z.string().nullish(),
        physicalName: z.string().nullish(),
        fields: z.array(z.any()).nullish(),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  persistence: z.object({ entities: z.array(z.string()).nullish() }).partial().nullish(),
  qualityFindings: z
    .array(z.object({ severity: z.string().nullish() }))
    .nullish()
    .transform((v) => v ?? []),
  securityFindings: z.array(z.any()).nullish().transform((v) => v ?? []),
});
export type ModuleDetail = z.infer<typeof ModuleDetail>;

/** VisionTools.getTechDebt — deterministic analyzer, no LLM call and no token spend. */
export const TechDebtStatus = z.object({
  analyzed: z.boolean().nullish(),
  summary: z
    .object({
      critical: z.number().nullish().transform((v) => v ?? 0),
      high: z.number().nullish().transform((v) => v ?? 0),
      medium: z.number().nullish().transform((v) => v ?? 0),
      low: z.number().nullish().transform((v) => v ?? 0),
      totalItems: z.number().nullish().transform((v) => v ?? 0),
    })
    .nullish(),
});

/** Tools this command cannot work without — checked once, so a deployment mismatch says so plainly. */
const REQUIRED_TOOLS = ['getWorkspaceOverview', 'listUirModules', 'getUirModule'] as const;

/**
 * Open one MCP session, run the extraction, close it. One session for the whole command: the
 * handshake costs a round trip and the stream carries every reply, so opening per call would pay
 * it once per module.
 */
export async function withMcp<T>(base: string, token: string, fn: (mcp: McpClient) => Promise<T>): Promise<T> {
  const mcp = new McpClient(base, token);
  await mcp.connect();
  try {
    const available = new Set((await mcp.listTools()).map((t) => t.name));
    const missing = REQUIRED_TOOLS.filter((t) => !available.has(t));
    if (missing.length) {
      throw new Error(`servidor MCP não expõe ${missing.join(', ')} — deployment incompatível`);
    }
    return await fn(mcp);
  } finally {
    mcp.close();
  }
}

export async function getWorkspaceOverview(mcp: McpClient, workspaceId: string): Promise<WorkspaceOverview> {
  return WorkspaceOverview.parse(await mcp.call('getWorkspaceOverview', { workspaceId }));
}

/** Every module summary — pages while the server says there is more. */
export async function listModules(mcp: McpClient, workspaceId: string): Promise<ModuleSummary[]> {
  const out: ModuleSummary[] = [];
  // 200 is the server's hard ceiling; asking for more silently gets 200 back.
  for (let page = 0; ; page++) {
    const p = ModulePage.parse(await mcp.call('listUirModules', { workspaceId, page, size: 200 }));
    out.push(...p.items);
    if (!p.hasMore || p.items.length === 0) break;
  }
  return out;
}

/**
 * The full compiled UIR of one module.
 *
 * getModuleRules would be cheaper, but it caps at 100 rules per module and a hub module carries
 * thousands — the cap is honest about truncating, and truncating is exactly what this command must
 * not do. getUirModule is the only uncapped path, and the payload lands on disk, not in a context
 * window.
 */
export async function getModule(mcp: McpClient, workspaceId: string, moduleId: string): Promise<ModuleDetail> {
  return ModuleDetail.parse(await mcp.call('getUirModule', { workspaceId, moduleId }));
}

/**
 * Workspace-wide tech debt, counted by the server's deterministic analyzer.
 *
 * Summing each module's `qualityFindings` instead would under-report badly: only the Java driver
 * emits them, so a Delphi or VB6 workspace reports a flat zero — which reads as "clean" when it
 * means "not measured". The server also counts implicit rules, ambiguous rules and cross-module
 * writes, none of which live on a module's finding list.
 *
 * Returns null when the deployment does not expose the tool, so the caller can fall back rather
 * than fail an otherwise complete extraction.
 */
export async function getTechDebt(
  mcp: McpClient,
  workspaceId: string,
): Promise<{ critical: number; high: number; medium: number; low: number } | null> {
  try {
    const s = TechDebtStatus.parse(await mcp.call('getTechDebt', { workspaceId })).summary;
    if (!s) return null;
    return { critical: s.critical, high: s.high, medium: s.medium, low: s.low };
  } catch {
    return null;
  }
}
