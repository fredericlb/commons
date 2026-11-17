// Low-level Grist REST client, bound to one document. Apps read the three
// GRIST_* settings from their own env and hand them to createGrist(); the
// client itself never touches the environment.

import type { GristColumn, GristConfig, GristRecord } from "./types.ts";
import { GristError } from "./types.ts";

interface FetchOpts {
  raw?: boolean;
  method?: string;
  body?: string | FormData;
  headers?: Record<string, string>;
}

export interface GristClient {
  isConfigured(): boolean;
  listRecords<T = Record<string, unknown>>(
    table: string,
    filter?: Record<string, unknown>,
  ): Promise<GristRecord<T>[]>;
  addRecords(
    table: string,
    fieldsList: Record<string, unknown>[],
  ): Promise<{ id: number }[]>;
  patchRecord(
    table: string,
    id: number,
    fields: Record<string, unknown>,
  ): Promise<void>;
  /** Batch form of patchRecord — one request for many rows. */
  patchRecords(
    table: string,
    records: { id: number; fields: Record<string, unknown> }[],
  ): Promise<void>;
  deleteRecords(table: string, ids: number[]): Promise<void>;
  uploadAttachment(
    buffer: Buffer,
    mime: string,
    filename: string,
  ): Promise<number>;
  downloadAttachment(attachmentId: number): Promise<Buffer>;
  listTables(): Promise<string[]>;
  createTable(id: string, columns: GristColumn[]): Promise<void>;
  listColumns(table: string): Promise<string[]>;
  addColumns(table: string, columns: GristColumn[]): Promise<void>;
  /**
   * Read-only SELECT against the doc. Reaches the internal _grist_* tables the
   * records API hides — notably _grist_Attachments for fileIdents.
   */
  runSql(sql: string, args?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Raw user actions, e.g. ["AddTable", "Name", [{id, type}, …]]. */
  apply(actions: unknown[][]): Promise<void>;
}

/**
 * Build a client for one Grist doc. Returned as plain closures so callers can
 * destructure them into free functions (`const { listRecords } = createGrist(…)`).
 * An unconfigured client is legal — isConfigured() reports it and every call
 * throws — so a backend can boot without Grist and degrade instead of crashing.
 */
export function createGrist({
  apiUrl,
  docId,
  apiKey,
  timeoutMs,
  allowAnonymous = false,
}: GristConfig): GristClient {
  const docBase =
    apiUrl && docId ? `${apiUrl.replace(/\/+$/, "")}/api/docs/${docId}` : null;

  const isConfigured = (): boolean =>
    Boolean(docBase) && (Boolean(apiKey) || allowAnonymous);

  async function gristFetch(
    path: string,
    { raw = false, ...init }: FetchOpts = {},
  ): Promise<Response> {
    if (!isConfigured()) {
      throw new GristError(
        503,
        "Grist is not configured — set GRIST_API_URL, GRIST_DOC_ID and GRIST_API_KEY",
      );
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      // No key at all means an open Grist — send no Authorization rather than
      // an empty bearer, which some setups reject outright.
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...init.headers,
    };
    // For JSON bodies set the content type; for FormData let fetch set it.
    if (init.body && !raw && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${docBase}${path}`, {
      ...init,
      headers,
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GristError(
        res.status,
        `Grist ${init.method || "GET"} ${path} → ${res.status} ${text}`,
      );
    }
    return res;
  }

  // --- Records --------------------------------------------------------------

  const listRecords = async <T = Record<string, unknown>>(
    table: string,
    filter?: Record<string, unknown>,
  ): Promise<GristRecord<T>[]> => {
    // Grist's filter is {"col": [v1, v2]} — accept a bare scalar and wrap it,
    // and skip the parameter entirely when there is nothing to filter on.
    let q = "";
    if (filter && Object.keys(filter).length > 0) {
      const wrapped: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(filter)) {
        wrapped[k] = Array.isArray(v) ? v : [v];
      }
      q = `?filter=${encodeURIComponent(JSON.stringify(wrapped))}`;
    }
    const res = await gristFetch(`/tables/${table}/records${q}`);
    return ((await res.json()) as { records: GristRecord<T>[] }).records;
  };

  const addRecords = async (
    table: string,
    fieldsList: Record<string, unknown>[],
  ): Promise<{ id: number }[]> => {
    if (!fieldsList.length) return [];
    const res = await gristFetch(`/tables/${table}/records`, {
      method: "POST",
      body: JSON.stringify({
        records: fieldsList.map((fields) => ({ fields })),
      }),
    });
    return ((await res.json()) as { records: { id: number }[] }).records;
  };

  const patchRecords = async (
    table: string,
    records: { id: number; fields: Record<string, unknown> }[],
  ): Promise<void> => {
    if (!records.length) return;
    await gristFetch(`/tables/${table}/records`, {
      method: "PATCH",
      body: JSON.stringify({ records }),
    });
  };

  const patchRecord = (
    table: string,
    id: number,
    fields: Record<string, unknown>,
  ): Promise<void> => patchRecords(table, [{ id, fields }]);

  const deleteRecords = async (table: string, ids: number[]): Promise<void> => {
    if (!ids.length) return;
    await gristFetch(`/tables/${table}/data/delete`, {
      method: "POST",
      body: JSON.stringify(ids),
    });
  };

  // --- Attachments ----------------------------------------------------------

  const uploadAttachment = async (
    buffer: Buffer,
    mime: string,
    filename: string,
  ): Promise<number> => {
    const form = new FormData();
    form.append("upload", new Blob([buffer], { type: mime }), filename);
    const res = await gristFetch(`/attachments`, {
      method: "POST",
      body: form,
      raw: true,
    });
    // Grist answers either a JSON array of ids or a bare number.
    const parsed = (await res.json()) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return Number(parsed[0]);
    if (typeof parsed === "number") return parsed;
    throw new GristError(
      502,
      `unexpected attachment upload response: ${JSON.stringify(parsed)}`,
    );
  };

  const downloadAttachment = async (attachmentId: number): Promise<Buffer> => {
    const res = await gristFetch(`/attachments/${attachmentId}/download`);
    return Buffer.from(await res.arrayBuffer());
  };

  // --- Schema (what the migration runner drives) ----------------------------

  const listTables = async (): Promise<string[]> => {
    const res = await gristFetch(`/tables`);
    return ((await res.json()) as { tables: { id: string }[] }).tables.map(
      (t) => t.id,
    );
  };

  const createTable = async (
    id: string,
    columns: GristColumn[],
  ): Promise<void> => {
    await gristFetch(`/tables`, {
      method: "POST",
      body: JSON.stringify({ tables: [{ id, columns }] }),
    });
  };

  const listColumns = async (table: string): Promise<string[]> => {
    const res = await gristFetch(`/tables/${table}/columns`);
    return ((await res.json()) as { columns: { id: string }[] }).columns.map(
      (c) => c.id,
    );
  };

  const addColumns = async (
    table: string,
    columns: GristColumn[],
  ): Promise<void> => {
    await gristFetch(`/tables/${table}/columns`, {
      method: "POST",
      body: JSON.stringify({ columns }),
    });
  };

  // --- Escape hatches -------------------------------------------------------

  const runSql = async (
    sql: string,
    args?: unknown[],
  ): Promise<Record<string, unknown>[]> => {
    const payload: Record<string, unknown> = { sql };
    if (args && args.length > 0) payload.args = args;
    const res = await gristFetch(`/sql`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const { records } = (await res.json()) as {
      records: { fields: Record<string, unknown> }[];
    };
    return records.map((r) => r.fields);
  };

  const apply = async (actions: unknown[][]): Promise<void> => {
    await gristFetch(`/apply`, {
      method: "POST",
      body: JSON.stringify(actions),
    });
  };

  return {
    isConfigured,
    listRecords,
    addRecords,
    patchRecord,
    patchRecords,
    deleteRecords,
    uploadAttachment,
    downloadAttachment,
    listTables,
    createTable,
    listColumns,
    addColumns,
    runSql,
    apply,
  };
}
