// Idempotent schema migration: create the tables a declared schema names, and
// add any columns missing from the ones that already exist. Never drops or
// retypes anything — safe to run on every deploy.

import type { GristClient } from "./client.ts";
import type { GristColumn, TableSchema } from "./types.ts";

const asColumns = (cols: [string, string][]): GristColumn[] =>
  cols.map(([id, type]) => ({ id, fields: { label: id, type } }));

/** What migrateSchema did, per table — the caller decides how to report it. */
export type MigrationStep =
  | { table: string; action: "created" }
  | { table: string; action: "columns-added"; columns: string[] }
  | { table: string; action: "up-to-date" };

/**
 * Reconcile `schema` against the doc. Returns one step per table in schema
 * order; throws if the client isn't configured (check isConfigured() first for
 * a friendlier message).
 */
export async function migrateSchema(
  grist: GristClient,
  schema: TableSchema,
): Promise<MigrationStep[]> {
  const existing = new Set(await grist.listTables());
  const steps: MigrationStep[] = [];

  for (const [table, cols] of Object.entries(schema)) {
    if (!existing.has(table)) {
      await grist.createTable(table, asColumns(cols));
      steps.push({ table, action: "created" });
      continue;
    }
    const have = new Set(await grist.listColumns(table));
    const missing = cols.filter(([id]) => !have.has(id));
    if (missing.length) {
      const columns = missing.map(([id]) => id);
      await grist.addColumns(table, asColumns(missing));
      steps.push({ table, action: "columns-added", columns });
    } else {
      steps.push({ table, action: "up-to-date" });
    }
  }
  return steps;
}

/** Render a step as the one-liner the migrate scripts print. */
export function describeStep(step: MigrationStep): string {
  switch (step.action) {
    case "created":
      return `✓ created table ${step.table}`;
    case "columns-added":
      return `✓ ${step.table}: added columns ${step.columns.join(", ")}`;
    default:
      return `• ${step.table}: up to date`;
  }
}
