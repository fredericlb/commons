import { describe, expect, it, vi } from "vitest";
import type { GristClient } from "./client.ts";
import { describeStep, migrateSchema } from "./migrate.ts";
import type { TableSchema } from "./types.ts";

// A client stub that only implements what migrateSchema drives.
function fakeGrist(doc: Record<string, string[]>) {
  const calls = {
    createTable: vi.fn(async (id: string) => {
      doc[id] = [];
    }),
    addColumns: vi.fn(async (table: string, columns: { id: string }[]) => {
      doc[table].push(...columns.map((c) => c.id));
    }),
  };
  const grist = {
    listTables: async () => Object.keys(doc),
    listColumns: async (table: string) => doc[table] ?? [],
    createTable: calls.createTable,
    addColumns: calls.addColumns,
  } as unknown as GristClient;
  return { grist, calls };
}

const SCHEMA: TableSchema = {
  Sessions: [
    ["Uid", "Text"],
    ["Gain", "Numeric"],
  ],
  Markers: [["AtSec", "Numeric"]],
};

describe("migrateSchema", () => {
  it("creates tables that don't exist yet", async () => {
    const { grist, calls } = fakeGrist({});
    const steps = await migrateSchema(grist, SCHEMA);
    expect(steps).toEqual([
      { table: "Sessions", action: "created" },
      { table: "Markers", action: "created" },
    ]);
    expect(calls.createTable).toHaveBeenCalledTimes(2);
    expect(calls.addColumns).not.toHaveBeenCalled();
  });

  it("adds only the missing columns of an existing table", async () => {
    const { grist, calls } = fakeGrist({
      Sessions: ["Uid"],
      Markers: ["AtSec"],
    });
    const steps = await migrateSchema(grist, SCHEMA);
    expect(steps).toEqual([
      { table: "Sessions", action: "columns-added", columns: ["Gain"] },
      { table: "Markers", action: "up-to-date" },
    ]);
    expect(calls.addColumns).toHaveBeenCalledWith("Sessions", [
      { id: "Gain", fields: { label: "Gain", type: "Numeric" } },
    ]);
    expect(calls.createTable).not.toHaveBeenCalled();
  });

  it("is idempotent — a second run touches nothing", async () => {
    const doc: Record<string, string[]> = {};
    const first = fakeGrist(doc);
    await migrateSchema(first.grist, SCHEMA);
    // The stub's createTable makes empty tables, so fill them as Grist would.
    doc.Sessions = ["Uid", "Gain"];
    doc.Markers = ["AtSec"];

    const second = fakeGrist(doc);
    const steps = await migrateSchema(second.grist, SCHEMA);
    expect(steps.every((s) => s.action === "up-to-date")).toBe(true);
    expect(second.calls.createTable).not.toHaveBeenCalled();
    expect(second.calls.addColumns).not.toHaveBeenCalled();
  });

  it("never drops columns the schema no longer names", async () => {
    const doc = { Sessions: ["Uid", "Gain", "Legacy"], Markers: ["AtSec"] };
    const { grist } = fakeGrist(doc);
    await migrateSchema(grist, SCHEMA);
    expect(doc.Sessions).toContain("Legacy");
  });
});

describe("describeStep", () => {
  it("renders each action", () => {
    expect(describeStep({ table: "T", action: "created" })).toBe(
      "✓ created table T",
    );
    expect(
      describeStep({
        table: "T",
        action: "columns-added",
        columns: ["A", "B"],
      }),
    ).toBe("✓ T: added columns A, B");
    expect(describeStep({ table: "T", action: "up-to-date" })).toBe(
      "• T: up to date",
    );
  });
});
