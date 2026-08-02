// The wire shapes of the Grist REST API, plus the doc coordinates a client
// needs. Kept separate so app code can name them without pulling the client in.

/** Connection details for one Grist document. */
export interface GristConfig {
  apiUrl?: string;
  docId?: string;
  apiKey?: string;
  /** Abort a request after this long. Omitted means no client-side deadline. */
  timeoutMs?: number;
  /**
   * Treat an empty apiKey as configured — for a Grist that needs no key (a
   * local or test instance). Off by default: for the hosted docs, a missing key
   * is a misconfiguration worth catching before the first 401.
   */
  allowAnonymous?: boolean;
}

/**
 * A Grist row: numeric id plus its column values. `T` narrows the bag when the
 * caller knows the table's shape (labs' typed reads); it defaults to open.
 */
export interface GristRecord<T = Record<string, unknown>> {
  id: number;
  fields: T;
}

/**
 * A non-2xx from Grist, carrying the status so a route can mirror it instead of
 * flattening everything to 500. Also raised with 503 when the client has no
 * credentials, and reusable by callers for their own status-bearing failures.
 */
export class GristError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GristError";
    this.status = status;
  }
}

export interface GristColumn {
  id: string;
  fields?: Record<string, unknown>;
}

/** One column in a declared schema: its id and its Grist type ("Text", "Bool", …). */
export type ColumnSpec = [id: string, type: string];

/** A whole schema: table id → its columns. */
export type TableSchema = Record<string, ColumnSpec[]>;
