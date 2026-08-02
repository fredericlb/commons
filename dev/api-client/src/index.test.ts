import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "./index.ts";

/** Records the last call and replies with whatever the test asks for. */
function stubFetch(reply: { status?: number; body?: string } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const status = reply.status ?? 200;
    const body = reply.body ?? "";
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fn, calls };
}

describe("createApiClient", () => {
  it("uses same-origin relative paths by default", () => {
    const api = createApiClient();
    expect(api.url("/api/songs")).toBe("/api/songs");
  });

  it("applies baseUrl and basePath, tolerating trailing/leading slashes", () => {
    expect(
      createApiClient({ baseUrl: "https://api.rec.test/" }).url("/api/x"),
    ).toBe("https://api.rec.test/api/x");
    // basePath mirrors Vite's BASE_URL, which ends with "/"
    expect(createApiClient({ basePath: "/f/" }).url("/api/x")).toBe("/f/api/x");
  });

  it("sends the session cookie by default", async () => {
    const { fn, calls } = stubFetch({ body: "[]" });
    await createApiClient({ fetch: fn }).get("/api/songs");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("parses JSON on success", async () => {
    const { fn } = stubFetch({ body: '{"id":1}' });
    expect(await createApiClient({ fetch: fn }).get("/api/x")).toEqual({
      id: 1,
    });
  });

  it("posts JSON with the right method, body and content-type", async () => {
    const { fn, calls } = stubFetch({ body: '{"ok":true}' });
    await createApiClient({ fetch: fn }).post("/api/songs", { title: "Hey" });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe('{"title":"Hey"}');
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBe("application/json");
  });

  it("returns null for 204 rather than choking on an empty body", async () => {
    const { fn } = stubFetch({ status: 204 });
    expect(await createApiClient({ fetch: fn }).del("/api/x")).toBeNull();
  });

  it("throws ApiError carrying the status and the server's message", async () => {
    const { fn } = stubFetch({ status: 409, body: "email already registered" });
    const api = createApiClient({ fetch: fn });
    await expect(api.post("/api/register", {})).rejects.toBeInstanceOf(
      ApiError,
    );
    try {
      await api.post("/api/register", {});
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(409);
      expect(e.message).toBe("email already registered");
    }
  });

  it("falls back to HTTP <status> when the server sends no message", async () => {
    const { fn } = stubFetch({ status: 500, body: "" });
    await expect(createApiClient({ fetch: fn }).get("/api/x")).rejects.toThrow(
      "HTTP 500",
    );
  });
});
