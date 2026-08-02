import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrist } from "./client.ts";
import { GristError } from "./types.ts";

const CONFIG = {
  apiUrl: "https://grist.example/",
  docId: "doc1",
  apiKey: "k",
};

// Stub global fetch and record what the client sent.
function stubFetch(res: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
    ...res,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createGrist", () => {
  it("strips trailing slashes when building the doc URL", async () => {
    const fetchMock = stubFetch({ json: async () => ({ records: [] }) });
    await createGrist(CONFIG).listRecords("Sessions");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://grist.example/api/docs/doc1/tables/Sessions/records",
    );
  });

  it("reports an unconfigured client instead of guessing a URL", async () => {
    const grist = createGrist({});
    expect(grist.isConfigured()).toBe(false);
    await expect(grist.listRecords("Sessions")).rejects.toBeInstanceOf(
      GristError,
    );
    await expect(grist.listRecords("Sessions")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("treats a missing apiKey as unconfigured by default", () => {
    expect(createGrist({ ...CONFIG, apiKey: "" }).isConfigured()).toBe(false);
  });

  it("accepts a keyless Grist when allowAnonymous, and sends no bearer", async () => {
    const fetchMock = stubFetch({ json: async () => ({ records: [] }) });
    const grist = createGrist({ ...CONFIG, apiKey: "", allowAnonymous: true });
    expect(grist.isConfigured()).toBe(true);
    await grist.listRecords("Sessions");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("wraps scalar filter values and omits an empty filter", async () => {
    const fetchMock = stubFetch({ json: async () => ({ records: [] }) });
    const grist = createGrist(CONFIG);

    await grist.listRecords("S", { Uid: "u1" });
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain(
      '{"Uid":["u1"]}',
    );

    // An already-wrapped value is passed through untouched.
    await grist.listRecords("S", { Uid: ["a", "b"] });
    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain(
      '{"Uid":["a","b"]}',
    );

    await grist.listRecords("S", {});
    expect(String(fetchMock.mock.calls[2][0])).not.toContain("filter");
  });

  it("carries Grist's status on the error so routes can mirror it", async () => {
    stubFetch({ ok: false, status: 404, text: async () => "no such table" });
    const err = await createGrist(CONFIG)
      .listRecords("Nope")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GristError);
    expect((err as GristError).status).toBe(404);
    expect((err as GristError).message).toContain("no such table");
  });

  it("patchRecord is the single-row form of patchRecords", async () => {
    const fetchMock = stubFetch({});
    await createGrist(CONFIG).patchRecord("Food", 7, { Pinned: true });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      records: [{ id: 7, fields: { Pinned: true } }],
    });
  });

  it("sends one request for a batch patch", async () => {
    const fetchMock = stubFetch({});
    await createGrist(CONFIG).patchRecords("Food", [
      { id: 1, fields: { Pinned: true } },
      { id: 2, fields: { Pinned: false } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the request entirely when there is nothing to write", async () => {
    const fetchMock = stubFetch({});
    const grist = createGrist(CONFIG);
    expect(await grist.addRecords("Food", [])).toEqual([]);
    await grist.patchRecords("Food", []);
    await grist.deleteRecords("Food", []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
