// boot.ts — what a desktop app checks and keeps on this machine before it starts its servers.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { type PortHolder, portBusyMessage, portHolder } from "./portHolder.ts";

/** Whether something already answers on `port` — a dev session, or the app run by another user account. */
export function portBusy(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      res(true);
    });
    s.once("error", () => res(false));
  });
}

/** A port the app needs, held by something else; `holder` when this account can see it. */
export class PortBusyError extends Error {
  constructor(
    readonly port: number,
    readonly holder: PortHolder | null,
    app: string,
  ) {
    super(portBusyMessage(port, holder, app));
    this.name = "PortBusyError";
  }
}

/** Throws a PortBusyError for the first port of `ports` that something already holds; `app` names the app in its text. */
export async function assertPortsFree(
  ports: number[],
  app = "This app",
): Promise<void> {
  for (const port of ports)
    if (await portBusy(port))
      throw new PortBusyError(port, await portHolder(port), app);
}

/** A secret generated once and kept in `dir`, so a restart keeps every session signed with it. */
export function persistentSecret(dir: string, name = "session-secret"): string {
  const at = join(dir, name);
  if (existsSync(at)) return readFileSync(at, "utf8").trim();
  const s = randomBytes(32).toString("hex");
  writeFileSync(at, s, { mode: 0o600 });
  return s;
}
