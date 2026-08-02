import { z } from 'zod';

/**
 * Legacy-neutral Intermediate Representation (IR).
 *
 * RNC normalizes ANY legacy (Delphi, COBOL, VB6, NATURAL, PL/SQL, RPG…) into
 * this shape. Every downstream phase (spec, clarify, roadmap, implement) keys
 * off the IR, never off the raw source language — that is what keeps the
 * user-facing workflow identical across wildly different legacies.
 *
 * This file is the CONTRACT. The RNC MCP client (src/core/rnc.ts) is the seam
 * that fills it. Until wired, `rnc analyze` writes a documented stub.
 */

export const Confidence = z.enum(['high', 'medium', 'low']);

export const Unit = z.object({
  id: z.string(), // DataMod.pas | STKUPD.cbl | ORDERS.copybook | subprogram id
  kind: z.string(), // module | program | copybook | screen-unit | job
  complexity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  blastRadius: z.number().int().nonnegative(),
  ruleCount: z.number().int().nonnegative(),
});

export const Entity = z.object({
  name: z.string(),
  fields: z.array(z.object({ name: z.string(), type: z.string().optional() })),
  confidence: Confidence,
});

export const Rule = z.object({
  id: z.string(), // BR-031
  unit: z.string(),
  semantics: z.string(),
  confidence: Confidence,
});

export const Surface = z.object({
  id: z.string(),
  kind: z.enum(['screen', 'batch', 'api', 'report']),
  label: z.string(),
});

export const Unknown = z.object({
  ref: z.string(),
  reason: z.enum(['AMBIGUOUS_RULE', 'DISCARDED', 'LOW_CONFIDENCE_BINDING', 'MISSING_SCHEMA']),
  question: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
});

export const Analysis = z.object({
  workspace: z.string(),
  sourceLang: z.string(), // detected label only — never branches logic
  sourceRetention: z.enum(['RETAINED', 'DISCARDED']),
  units: z.array(Unit),
  entities: z.array(Entity),
  rules: z.array(Rule),
  surfaces: z.array(Surface),
  graph: z.object({ edges: z.array(z.tuple([z.string(), z.string()])) }),
  techDebt: z.object({ critical: z.number(), high: z.number(), medium: z.number(), low: z.number() }),
  unknowns: z.array(Unknown),
});

export type Analysis = z.infer<typeof Analysis>;
export type Unknown = z.infer<typeof Unknown>;

/** Build-order derived from blast radius: highest-impact root first, leaves last. */
export function buildOrder(a: Analysis): typeof a.units {
  return [...a.units].sort((x, y) => y.blastRadius - x.blastRadius);
}
