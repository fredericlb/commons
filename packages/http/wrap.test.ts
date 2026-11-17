// wrap() on a real server: which thrown errors reach the client, and which only the log.

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpError, wrap } from "./route.ts";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.get(
    "/boom/:token",
    wrap(() => {
      throw new Error("upstream detail: grist doc abc123");
    }),
  );
  app.get(
    "/refused",
    wrap(() => {
      throw new HttpError(409, "already taken");
    }),
  );
  // An upstream client error that never said its message may be shown.
  app.get(
    "/upstream404",
    wrap(() => {
      throw Object.assign(new Error("Grist: table Foo not found"), {
        status: 404,
      });
    }),
  );
  app.get(
    "/http-errors",
    wrap(() => {
      throw Object.assign(new Error("too many"), {
        statusCode: 429,
        expose: true,
      });
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("wrap", () => {
  it("answers a generic 500 and logs the route pattern, never the URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await fetch(`${base}/boom/s3cret`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    expect(log.mock.calls[0]?.[0]).toBe("GET /boom/:token failed:");
    expect(String(log.mock.calls[0]?.[1])).toContain("upstream detail");
    log.mockRestore();
  });

  it("keeps an HttpError's status and message, unlogged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await fetch(`${base}/refused`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already taken" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("hides a 4xx that is not exposed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await fetch(`${base}/upstream404`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    log.mockRestore();
  });

  it("honours an exposed http-errors style statusCode", async () => {
    const res = await fetch(`${base}/http-errors`);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too many" });
  });
});
