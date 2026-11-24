import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "../bin/gitlytics.js";
import { createDashboardServer } from "../src/dashboard/server.js";

test("createDashboardServer rejects non-loopback host without --public-bind", () => {
  assert.throws(() => createDashboardServer({ host: "0.0.0.0", publicBind: false }));
  const srv = createDashboardServer({ host: "0.0.0.0", publicBind: true });
  assert.ok(srv);
});

test("CLI --version and --help exit cleanly with code 0", async () => {
  const codeHelp = await runCli(["--help"]);
  assert.equal(codeHelp, 0);
  const codeVer = await runCli(["--version"]);
  assert.equal(codeVer, 0);
});
