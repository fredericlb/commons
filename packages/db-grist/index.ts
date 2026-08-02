// @frediverse/db-grist — the Grist REST client and the idempotent schema
// migration runner shared by the frediverse backends. Apps supply their own
// GRIST_* config and their own table schema; everything else lives here.

export { createGrist, type GristClient } from "./client.ts";
export {
  describeStep,
  type MigrationStep,
  migrateSchema,
} from "./migrate.ts";
export type {
  ColumnSpec,
  GristColumn,
  GristConfig,
  GristRecord,
  TableSchema,
} from "./types.ts";
export { GristError } from "./types.ts";
