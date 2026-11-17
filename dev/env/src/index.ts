import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export { z };

/** The config file every service reads its dev values from. */
export const ENV_FILE = "env.yaml";
/** Section applied to every service, before its own. */
const COMMON = "common";

/** Thrown when the environment doesn't satisfy the schema. */
export class EnvError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
    this.issues = issues;
  }
}

export interface DefineEnvOptions {
  /**
   * This service's section in the root `env.yaml` (e.g. "radiok7-backend").
   * Its keys are layered over `common`. Omit to read only process.env.
   */
  service?: string;
  /** Explicit path to the yaml. Defaults to the nearest `env.yaml` walking up. */
  file?: string;
  /** Bypass both the yaml and process.env. For tests. */
  source?: Record<string, string | undefined>;
}

/**
 * Whether we may go looking for an env.yaml on our own.
 *
 * False under a test runner: a suite must not silently pick up the developer's
 * real env.yaml. It would assert against live secrets, behave differently on
 * every machine and in CI (where the file doesn't exist), and — since the yaml
 * outranks process.env — override the very values the test just set. A test
 * that genuinely wants a yaml passes `file` (or `source`) explicitly.
 */
function autoFileAllowed(): boolean {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}

/** Nearest `env.yaml` walking up from `from` — the monorepo root, in practice. */
function findEnvFile(from: string = process.cwd()): string | null {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, ENV_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null; // hit the filesystem root
    dir = parent;
  }
}

/**
 * Read `common` + the service's section out of the root env.yaml, flattened to
 * the string map an env schema expects. Missing file / section → {}, so a
 * container with no yaml simply falls through to its real environment.
 */
export function loadServiceEnv(
  service: string,
  file?: string,
): Record<string, string> {
  const path = file ?? (autoFileAllowed() ? findEnvFile() : null);
  if (!path || !existsSync(path)) return {};

  const doc = (parse(readFileSync(path, "utf8")) ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const merged = { ...(doc[COMMON] ?? {}), ...(doc[service] ?? {}) };

  // YAML is typed (numbers, booleans); env values are strings, and the schemas
  // coerce from strings. Normalise so `PORT: 8787` and `PORT: "8787"` behave
  // identically. `null`/absent means "not set" — drop it so defaults apply.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * Parse and validate configuration against a zod shape, failing fast at startup
 * with every problem listed at once (rather than the first `undefined` blowing
 * up somewhere deep in a request handler).
 *
 * Values come from the root `env.yaml` (its `common` section, then the
 * service's own), layered over `process.env`:
 *
 *   export const env = defineEnv({
 *     PORT: port(8787),
 *     HA_BASE_URL: url(),
 *   }, { service: "radiok7-backend" });
 *
 * The yaml wins where it declares a key. That's deliberate: it's explicit,
 * per-service dev config, and it stops an ambient `PORT` (which dev tooling
 * sets for the primary preview server) from silently hijacking a backend. In
 * production there is no env.yaml — images exclude it — so `process.env` is the
 * only source and the container's own vars apply.
 *
 * Under a test runner the auto-discovered yaml is ignored entirely (see
 * autoFileAllowed). Tests must be hermetic: a suite that reads the developer's
 * real env.yaml would assert against their live secrets, pass or fail depending
 * on whose machine it runs on, and — because the yaml outranks process.env —
 * silently beat the values the test itself injected. An explicit `file` or
 * `source` is still honoured, since that's the test stating what it wants.
 */
export function defineEnv<S extends z.ZodRawShape>(
  shape: S,
  options: DefineEnvOptions = {},
): z.infer<z.ZodObject<S>> {
  const source =
    options.source ??
    (options.service
      ? { ...process.env, ...loadServiceEnv(options.service, options.file) }
      : process.env);

  // Only feed the declared keys in: a stray env var (or an unrelated key in the
  // yaml's `common` section) must never change how the app is configured.
  const picked: Record<string, string | undefined> = {};
  for (const key of Object.keys(shape)) picked[key] = source[key];

  const result = z.object(shape).safeParse(picked);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    );
  }
  return result.data as z.infer<z.ZodObject<S>>;
}

/** A TCP port, coerced from the string env value. */
export function port(defaultValue?: number) {
  const schema = z.coerce.number().int().min(1).max(65535);
  return defaultValue === undefined ? schema : schema.default(defaultValue);
}

/** An http(s) URL with any trailing slash removed, so `${base}/api` is safe. */
export function url(defaultValue?: string) {
  const schema = z
    .string()
    .url()
    .transform((v) => v.replace(/\/$/, ""));
  return defaultValue === undefined ? schema : schema.default(defaultValue);
}

/** A non-empty string — the common "this secret must be set" case. */
export function required(message = "is required") {
  return z.string().min(1, message);
}

/** An env flag: "false"/"0"/"no" are false, anything else present is true. */
export function flag(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? defaultValue : !/^(false|0|no)$/i.test(v),
    );
}
