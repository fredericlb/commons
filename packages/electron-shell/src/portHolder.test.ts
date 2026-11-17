// portHolder.test.ts — reading lsof, netstat and tasklist output, and the message a busy port gives.

import { describe, expect, it } from "vitest";
import {
  parseLsof,
  parseNetstat,
  parseTasklist,
  portBusyMessage,
} from "./portHolder.ts";

describe("parseLsof", () => {
  it("takes the first process with its command and user", () => {
    const out = "p4242\ncnode\nLfred\nf23\np99\ncother\n";
    expect(parseLsof(out)).toEqual({
      pid: 4242,
      command: "node",
      user: "fred",
    });
  });

  it("is null on empty output", () => {
    expect(parseLsof("")).toBeNull();
  });
});

describe("parseNetstat", () => {
  const out = [
    "",
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:187890       0.0.0.0:0              LISTENING       11",
    "  TCP    127.0.0.1:18789        127.0.0.1:50000        ESTABLISHED     22",
    "  TCP    127.0.0.1:18789        0.0.0.0:0              ABHÖREN         3344",
    "  TCP    [::]:18789             [::]:0                 LISTENING       3345",
  ].join("\r\n");

  it("finds the listener whatever language names its state", () => {
    expect(parseNetstat(out, 18789)).toBe(3344);
  });

  it("is null when nothing listens there", () => {
    expect(parseNetstat(out, 8080)).toBeNull();
  });
});

describe("parseTasklist", () => {
  it("reads the image name", () => {
    expect(
      parseTasklist('"node.exe","3344","Console","1","50,000 K"\r\n'),
    ).toBe("node.exe");
    expect(parseTasklist("INFO: No tasks are running")).toBeNull();
  });
});

describe("portBusyMessage", () => {
  it("names the holder when known", () => {
    const m = portBusyMessage(
      18789,
      { pid: 7, command: "k7", user: "ann" },
      "k7",
    );
    expect(m).toContain("k7 (pid 7, user ann)");
    expect(m).toContain("another user account");
  });

  it("says when the holder cannot be seen", () => {
    expect(portBusyMessage(1, null, "App")).toContain("cannot see");
  });
});
