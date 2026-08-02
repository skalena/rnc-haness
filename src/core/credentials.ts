import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { z } from 'zod';
import { ensureHome, credentialsPath } from './config.js';

/**
 * Credential store. RNC-MCP-INTEGRATION.md §5.
 * File mode 0600, directory 0700. Keyed by baseUrl so a dev token never
 * overwrites a production one. The token is opaque — never logged, never in a
 * query string.
 */
export const Credential = z.object({
  baseUrl: z.string(),
  accessToken: z.string(),
  expiresAt: z.string(),
  subject: z.string(),
  clientName: z.string().optional(),
});
export type Credential = z.infer<typeof Credential>;

const Store = z.record(Credential); // { [baseUrl]: Credential }

function readStore(): Record<string, Credential> {
  const p = credentialsPath();
  if (!existsSync(p)) return {};
  try {
    return Store.parse(JSON.parse(readFileSync(p, 'utf8')));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Credential>): void {
  ensureHome();
  writeFileSync(credentialsPath(), JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
}

export function saveCredential(cred: Credential): void {
  const store = readStore();
  store[cred.baseUrl] = cred;
  writeStore(store);
}

export function loadCredential(baseUrl: string): Credential | null {
  return readStore()[baseUrl] ?? null;
}

export function removeCredential(baseUrl: string): boolean {
  const store = readStore();
  if (!store[baseUrl]) return false;
  delete store[baseUrl];
  if (Object.keys(store).length === 0) rmSync(credentialsPath(), { force: true });
  else writeStore(store);
  return true;
}

/** True when the stored token is past its 90-day expiry. */
export function isExpired(cred: Credential): boolean {
  return new Date(cred.expiresAt).getTime() <= Date.now();
}

/** Show only a safe prefix — never the full token. §5. */
export function redact(token: string): string {
  return token.slice(0, 6) + '…';
}
