import { z } from 'zod';

/**
 * RNC API client — the wire contract from RNC-MCP-INTEGRATION.md.
 * Endpoint paths, field names, status codes and error strings are exact.
 *
 * Auth flow (device pairing, §3):
 *   startPairing → (user approves in browser) → awaitApproval → whoami
 *
 * The MCP tool calls (SSE transport, §7) are the remaining seam: see
 * listWorkspaces/getModuleRules/etc. — mcpTools() below documents them.
 */

export const PairingStart = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  verificationUriComplete: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
});
export type PairingStart = z.infer<typeof PairingStart>;

export const TokenGrant = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.string(),
  subject: z.string(),
});
export type TokenGrant = z.infer<typeof TokenGrant>;

export const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  modules: z.number(),
});
export type Workspace = z.infer<typeof Workspace>;

export const WhoAmI = z.object({
  subject: z.string(),
  tenantId: z.string().nullable(),
  role: z.string().nullable(),
  platformAdmin: z.boolean(),
  workspaces: z.array(Workspace),
});
export type WhoAmI = z.infer<typeof WhoAmI>;

/** Terminal pairing outcomes. §3.3. */
export class PairingError extends Error {
  constructor(readonly code: 'access_denied' | 'expired_token' | 'timeout') {
    super(code);
    this.name = 'PairingError';
  }
}

/** Token expired (90d) or revoked. §6 — discard credential, re-login. */
export class AuthError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the deployment does not expose the device-pairing endpoints. */
export class PairingUnavailable extends Error {}

/** §3.1 — start pairing, returns device + user code. */
export async function startPairing(base: string, clientName: string): Promise<PairingStart> {
  const res = await fetch(`${base}/auth/cli/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName }),
  });
  // Not every deployment ships device pairing (it 404s on the hosted API today).
  // Surface that as a distinct condition so `login` can offer the token path.
  if (res.status === 404) throw new PairingUnavailable('device pairing não disponível neste deployment');
  if (!res.ok) throw new Error(`pair failed: HTTP ${res.status}`);
  return PairingStart.parse(await res.json());
}

/**
 * §3.3 — poll until approved. Honours `interval` measured against the PREVIOUS
 * poll; backs off on slow_down; aborts on access_denied / expired_token.
 */
export async function awaitApproval(
  base: string,
  deviceCode: string,
  startInterval: number,
  expiresIn: number,
): Promise<TokenGrant> {
  let interval = startInterval;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);

    const res = await fetch(`${base}/auth/cli/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });

    if (res.ok) return TokenGrant.parse(await res.json());

    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    switch (error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        interval += 5; // RFC 8628: back off, do not give up
        break;
      case 'access_denied':
      case 'expired_token':
        throw new PairingError(error);
      default:
        throw new Error(`unexpected pairing response: HTTP ${res.status} ${error ?? ''}`);
    }
  }
  throw new PairingError('timeout');
}

/**
 * §3.4 — identity + visible workspaces. Branch on STATUS CODE, never message
 * (§6: server.error.include-message=never). 401 = re-login; 403 = scope bug.
 *
 * Two deployments exist: the doc's scoped `/mcp/whoami`, and the prod REST
 * deployment (api.rnc.skalena.co) which exposes `/api/v1/profile` +
 * `/api/v1/workspaces`. Try the former, fall back to the latter and synthesize
 * the same WhoAmI shape.
 */
export async function whoami(base: string, token: string): Promise<WhoAmI> {
  const res = await fetch(`${base}/mcp/whoami`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new AuthError('token expired or revoked — run `rnc mcp login`');
  if (res.ok) return WhoAmI.parse(await res.json());
  if (res.status === 404) return whoamiViaRest(base, token); // prod REST deployment
  throw new Error(`whoami failed: HTTP ${res.status}`);
}

/** Fallback: build WhoAmI from /api/v1/profile + /api/v1/workspaces. */
async function whoamiViaRest(base: string, token: string): Promise<WhoAmI> {
  const { getProfile, listWorkspaces } = await import('./rncApi.js');
  const [profile, workspaces] = await Promise.all([getProfile(base, token), listWorkspaces(base, token)]);
  return {
    subject: profile.email,
    tenantId: null,
    role: null,
    platformAdmin: false,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, status: w.status, modules: w.stats?.totalModules ?? 0 })),
  };
}

/**
 * Resolve a workspace by UUID or case-insensitive name prefix. §3.4 — there is
 * no slug. Returns the match or throws with the available names.
 */
export function resolveWorkspace(me: WhoAmI, needle: string): Workspace {
  const byId = me.workspaces.find((w) => w.id === needle);
  if (byId) return byId;
  const lower = needle.toLowerCase();
  const byName = me.workspaces.filter((w) => w.name.toLowerCase().startsWith(lower));
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(`'${needle}' é ambíguo: ${byName.map((w) => w.name).join(', ')}`);
  }
  throw new Error(`workspace '${needle}' não encontrado. Disponíveis: ${me.workspaces.map((w) => w.name).join(', ')}`);
}

/**
 * SEAM — MCP tool surface (§7). Read-only, tenant-scoped, SSE transport.
 * The `analyze` command will drive these to build the IR:
 *   listUirModules · getUirModule · getModuleScreens · getModuleRules
 *   getModuleDataModel · getSecurityReport · getTechDebt · getUserStories
 * No tool takes a token argument — identity comes from the Bearer header.
 */
export const MCP_TOOLS = [
  'listWorkspaces',
  'getWorkspaceOverview',
  'listUirModules',
  'getUirModule',
  'getModuleScreens',
  'getModuleRules',
  'getModuleDataModel',
  'searchModules',
  'getSecurityReport',
  'getTechDebt',
  'getExecutiveSummary',
  'getUserStories',
] as const;
