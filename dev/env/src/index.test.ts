import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defineEnv,
  EnvError,
  flag,
  loadServiceEnv,
  port,
  required,
  url,
  z,
} from "./index.ts";

/** Write an env.yaml into a temp dir and return its path. */
function envFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fd-env-"));
  const path = join(dir, "env.yaml");
  writeFileSync(path, body);
  return path;
}

describe("defineEnv", () => {
  it("coerces and applies defaults", () => {
    const env = defineEnv(
      { PORT: port(8787), DATA_DIR: z.string().default("./data") },
      { source: {} },
    );
    expect(env.PORT).toBe(8787);
    expect(env.DATA_DIR).toBe("./data");
  });

  it("coerces a provided port from its string value", () => {
    const env = defineEnv({ PORT: port(8787) }, { source: { PORT: "4000" } });
    expect(env.PORT).toBe(4000);
  });

  it("reports every problem at once, not just the first", () => {
    try {
      defineEnv(
        { HA_TOKEN: required(), HA_BASE_URL: url(), PORT: port() },
        { source: { PORT: "nope" } },
      );
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).issues).toHaveLength(3);
      expect((err as EnvError).message).toContain("HA_TOKEN");
      expect((err as EnvError).message).toContain("HA_BASE_URL");
      expect((err as EnvError).message).toContain("PORT");
    }
  });

  it("rejects an out-of-range port", () => {
    expect(() =>
      defineEnv({ PORT: port() }, { source: { PORT: "70000" } }),
    ).toThrow(EnvError);
  });

  it("strips a trailing slash from urls so `${base}/api` is safe", () => {
    const env = defineEnv(
      { AUTHELIA_URL: url() },
      { source: { AUTHELIA_URL: "http://authelia:9091/" } },
    );
    expect(env.AUTHELIA_URL).toBe("http://authelia:9091");
  });

  it("ignores keys that aren't declared in the schema", () => {
    const env = defineEnv(
      { PORT: port(1234) },
      { source: { PORT: "1", SNEAKY: "x" } },
    );
    expect(env).toEqual({ PORT: 1 });
  });

  it("treats false/0/no as false and anything else present as true", () => {
    const schema = { AUTO_LOGIN: flag(true) };
    expect(defineEnv(schema, { source: {} }).AUTO_LOGIN).toBe(true);
    expect(
      defineEnv(schema, { source: { AUTO_LOGIN: "false" } }).AUTO_LOGIN,
    ).toBe(false);
    expect(defineEnv(schema, { source: { AUTO_LOGIN: "0" } }).AUTO_LOGIN).toBe(
      false,
    );
    expect(
      defineEnv(schema, { source: { AUTO_LOGIN: "yes" } }).AUTO_LOGIN,
    ).toBe(true);
  });
});

describe("loadServiceEnv (env.yaml)", () => {
  const file = () =>
    envFile(`
common:
  GRIST_API_KEY: shared-key
  GRIST_API_URL: https://grist.example
radiok7-backend:
  PORT: 8787
  GRIST_DOC_ID: radiok7-doc
routine-backend:
  PORT: 8788
  GRIST_DOC_ID: routine-doc
`);

  it("layers the service's section over common", () => {
    expect(loadServiceEnv("radiok7-backend", file())).toEqual({
      GRIST_API_KEY: "shared-key",
      GRIST_API_URL: "https://grist.example",
      PORT: "8787",
      GRIST_DOC_ID: "radiok7-doc",
    });
  });

  it("gives each service its own value for the SAME key — the whole point", () => {
    const f = file();
    expect(loadServiceEnv("radiok7-backend", f).PORT).toBe("8787");
    expect(loadServiceEnv("routine-backend", f).PORT).toBe("8788");
  });

  it("stringifies yaml scalars, so `PORT: 8787` and `PORT: '8787'` behave alike", () => {
    const f = envFile("svc:\n  PORT: 8787\n  DEBUG: true\n");
    expect(loadServiceEnv("svc", f)).toEqual({ PORT: "8787", DEBUG: "true" });
  });

  it("drops null so the schema default still applies", () => {
    const f = envFile("svc:\n  DATA_DIR:\n");
    expect(loadServiceEnv("svc", f)).toEqual({});
    expect(
      defineEnv(
        { DATA_DIR: z.string().default("./d") },
        { service: "svc", file: f },
      ),
    ).toEqual({ DATA_DIR: "./d" });
  });

  it("returns only common for an unknown service, and {} for a missing file", () => {
    expect(loadServiceEnv("nope", file())).toEqual({
      GRIST_API_KEY: "shared-key",
      GRIST_API_URL: "https://grist.example",
    });
    expect(loadServiceEnv("svc", "/does/not/exist/env.yaml")).toEqual({});
  });
});

describe("defineEnv + env.yaml precedence", () => {
  it("reads values from the service's section", () => {
    const f = envFile("radiok7-backend:\n  PORT: 8787\n");
    expect(
      defineEnv({ PORT: port(1) }, { service: "radiok7-backend", file: f })
        .PORT,
    ).toBe(8787);
  });

  it("lets the yaml win over an ambient env var it declares", () => {
    // Dev tooling sets an ambient PORT for the primary preview server; it must
    // not hijack a backend whose port the yaml states explicitly.
    const f = envFile("radiok7-backend:\n  PORT: 8787\n");
    const prev = process.env.PORT;
    process.env.PORT = "5173";
    try {
      expect(
        defineEnv({ PORT: port(1) }, { service: "radiok7-backend", file: f })
          .PORT,
      ).toBe(8787);
    } finally {
      if (prev === undefined) delete process.env.PORT;
      else process.env.PORT = prev;
    }
  });

  it("falls back to process.env for keys the yaml omits — the production path", () => {
    const f = envFile("radiok7-backend:\n  PORT: 8787\n");
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "from-the-container";
    try {
      const env = defineEnv(
        { PORT: port(1), SESSION_SECRET: z.string().default("dev") },
        { service: "radiok7-backend", file: f },
      );
      expect(env.SESSION_SECRET).toBe("from-the-container");
    } finally {
      if (prev === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prev;
    }
  });
});
