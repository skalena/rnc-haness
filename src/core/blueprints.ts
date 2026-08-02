import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { blueprintsDir } from './paths.js';

/**
 * A blueprint is one technology fragment (a frontend, backend, or database).
 * The composer reads these declarations — it never hardcodes a stack. Adding a
 * new technology = adding one blueprint file, not editing the composer.
 */
export const Blueprint = z.object({
  id: z.string(),
  kind: z.enum(['frontend', 'backend', 'database']),
  label: z.string(),
  lang: z.string().optional(),
  port: z.number().optional(),
  health: z.string().optional(),
  env: z.array(z.string()).default([]),
  /** backend only: which database ids this backend has a persistence adapter for */
  persistence: z.array(z.string()).optional(),
  /** frontend only: OpenAPI client generator */
  apiClient: z.string().optional(),
  /** database only */
  image: z.string().optional(),
  volume: z.string().optional(),
  test: z.record(z.string()).default({}),
  /** backend only: migration tool per database id */
  migration: z.record(z.string()).optional(),
  compose: z
    .object({
      build: z.string().optional(),
      dependsOn: z.array(z.string()).default([]),
    })
    .optional(),
});
export type Blueprint = z.infer<typeof Blueprint>;

let cache: Blueprint[] | null = null;

export function loadBlueprints(): Blueprint[] {
  if (cache) return cache;
  const out: Blueprint[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'blueprint.yaml') {
        const raw = parse(readFileSync(p, 'utf8'));
        out.push(Blueprint.parse(raw));
      }
    }
  };
  walk(blueprintsDir);
  cache = out;
  return out;
}

export function byKind(kind: Blueprint['kind']): Blueprint[] {
  return loadBlueprints().filter((b) => b.kind === kind);
}

export function find(id: string): Blueprint | undefined {
  return loadBlueprints().find((b) => b.id === id);
}
