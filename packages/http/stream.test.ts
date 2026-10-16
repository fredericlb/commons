import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { streamFile } from "./stream.ts";

let dir: string;
let file: string;
let base: string;
let close: () => void;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "http-stream-"));
  file = join(dir, "a.bin");
  writeFileSync(file, "0123456789");
  utimesSync(
    file,
    new Date("2026-01-02T03:04:05Z"),
    new Date("2026-01-02T03:04:05Z"),
  );
  const app = express();
  app.get("/f", (req, res) => streamFile(req, res, file, "audio/wav"));
  app.get("/own", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    streamFile(req, res, file, "audio/wav");
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { headers });

describe("streamFile's validators", () => {
  it("stamps a weak ETag, a Last-Modified and a revalidating Cache-Control", async () => {
    const r = await get("/f");
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toMatch(/^W\/"a-[0-9a-f]+"$/);
    expect(r.headers.get("last-modified")).toBe(
      "Fri, 02 Jan 2026 03:04:05 GMT",
    );
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
    expect(await r.text()).toBe("0123456789");
  });

  it("keeps a Cache-Control the caller set", async () => {
    expect((await get("/own")).headers.get("cache-control")).toBe(
      "public, max-age=60",
    );
  });

  it("answers 304 with no body to a matching If-None-Match", async () => {
    const etag = (await get("/f")).headers.get("etag") as string;
    const r = await get("/f", { "if-none-match": etag });
    expect(r.status).toBe(304);
    expect(r.headers.get("etag")).toBe(etag);
    expect(await r.text()).toBe("");
    // The comparison is weak: a strong spelling of the same tag matches too.
    expect(
      (await get("/f", { "if-none-match": `"x", ${etag.slice(2)}` })).status,
    ).toBe(304);
  });

  it("serves the file again once the tag no longer matches", async () => {
    const r = await get("/f", { "if-none-match": 'W/"other"' });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("0123456789");
  });

  it("answers 304 to If-Modified-Since when no tag is sent", async () => {
    const r = await get("/f", {
      "if-modified-since": "Fri, 02 Jan 2026 03:04:05 GMT",
    });
    expect(r.status).toBe(304);
    expect(
      (
        await get("/f", {
          "if-modified-since": "Fri, 02 Jan 2026 03:04:04 GMT",
        })
      ).status,
    ).toBe(200);
  });
});

describe("streamFile's If-Range", () => {
  it("honours the Range when If-Range carries the current tag", async () => {
    const etag = (await get("/f")).headers.get("etag") as string;
    const r = await get("/f", { range: "bytes=2-4", "if-range": etag });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await r.text()).toBe("234");
  });

  it("honours the Range when If-Range carries the current date", async () => {
    const r = await get("/f", {
      range: "bytes=2-4",
      "if-range": "Fri, 02 Jan 2026 03:04:05 GMT",
    });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("234");
  });

  it("sends the whole file when If-Range names an older version", async () => {
    const r = await get("/f", { range: "bytes=2-4", "if-range": 'W/"a-0"' });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-range")).toBeNull();
    expect(await r.text()).toBe("0123456789");
  });

  it("still serves a plain Range with no If-Range", async () => {
    const r = await get("/f", { range: "bytes=-3" });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("789");
  });
});
