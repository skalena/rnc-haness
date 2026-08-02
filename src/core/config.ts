import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Harness configuration & credential home.
 * See RNC-MCP-INTEGRATION.md §9. The web-app URL is NOT configurable — it
 * arrives in the pairing response, already correct per environment.
 */

/** API base URL (not the web app). RNC-MCP-INTEGRATION.md §2/§9. */
export function baseUrl(override?: string): string {
  return override ?? process.env.RNC_BASE_URL ?? 'http://localhost:8080';
}

/** ~/.rnc unless overridden. */
export function rncHome(): string {
  return process.env.RNC_CONFIG_HOME ?? join(homedir(), '.rnc');
}

export function ensureHome(): string {
  const dir = rncHome();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export const credentialsPath = () => join(rncHome(), 'credentials.json');
export const configPath = () => join(rncHome(), 'config.json');

interface Config {
  defaultWorkspace?: string;
}

export function readConfig(): Config {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Config;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: Config): void {
  ensureHome();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

export function setDefaultWorkspace(id: string): void {
  const cfg = readConfig();
  cfg.defaultWorkspace = id;
  writeConfig(cfg);
}
