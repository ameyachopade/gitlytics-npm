import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../bin/gitlytics.js";
import { mergeAndWriteVault, parseCsvText, queryCsvVault, serializeCsvRows } from "../src/csv-vault.js";
import { Readable } from "node:stream";
import { createDashboardServer } from "../src/dashboard/server.js";
import { buildWidgetEmbed, fetchStarHistory, fetchTraffic, StargazersRestrictedError } from "../src/index.js";
import { handleLocalJsonRpcMessage } from "../src/mcp/local-server.js";

test("CSV round-trip preserves quoted commas, quotes, yearly partition, and empty dirs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-npm-edge-"));
  try {
    const empty = queryCsvVault({ dataDir: path.join(dir, "does-not-exist") });
    assert.equal(empty.row_count, 0);
    assert.equal(empty.files_scanned, 0);

    const today = new Date().toISOString().slice(0, 10);
    const out = mergeAndWriteVault(
      [
        {
          date: today,
          repository: "octocat/demo",
          views: 15,
          unique_visitors: 10,
          clones: 3,
          unique_cloners: 2,
          top_referrer: 'google.com, "search"',
          _raw_referrers: '[{"referrer":"google.com"}]',
        },
      ],
      { dataDir: dir, outputMode: "yearly" },
    );
    assert.ok(out.files[0].endsWith(`traffic_${today.slice(0, 4)}.csv`));

    const serialized = serializeCsvRows(parseCsvText(fs.readFileSync(out.files[0], "utf8")));
    const parsed = parseCsvText(serialized);
    assert.equal(parsed[0].top_referrer, 'google.com, "search"');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fetchStarHistory raises StargazersRestrictedError on 403 non-rate-limit", async () => {
  const restrictedFetch = async () => ({
    ok: false,
    status: 403,
    headers: new Headers({ "x-ratelimit-remaining": "4999" }),
  });
  await assert.rejects(
    () => fetchStarHistory("octocat", "demo", { token: "ghp_test", fetchImpl: restrictedFetch }),
    StargazersRestrictedError,
  );
});

test("fetchTraffic publicOnly strips private repositories", async () => {
  const privFetch = async (url) => {
    if (url.endsWith("/repos/octocat/secret")) {
      return { ok: true, status: 200, json: async () => ({ full_name: "octocat/secret", private: true }) };
    }
    if (url.endsWith("/traffic/views")) {
      return { ok: true, status: 200, json: async () => ({ views: [{ timestamp: "2026-11-23T00:00:00Z", count: 9, uniques: 4 }] }) };
    }
    if (url.endsWith("/traffic/clones")) {
      return { ok: true, status: 200, json: async () => ({ clones: [] }) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const res = await fetchTraffic({
    token: "ghp_test",
    repoName: "octocat/secret",
    publicOnly: true,
    fetchImpl: privFetch,
  });
  assert.equal(res.records.length, 0);
  assert.equal(res.privateRepos.has("octocat/secret"), true);
});

test("buildWidgetEmbed supports all 6 widget kinds and validates required inputs", () => {
  assert.ok(buildWidgetEmbed({ kind: "tech_badge", slug: "python" }).url.includes("slug=python"));
  assert.ok(buildWidgetEmbed({ kind: "static_badge", label: "A", message: "B" }).url.includes("message=B"));
  assert.ok(buildWidgetEmbed({ kind: "live_badge", owner: "a", repo: "b", metric: "stars" }).url.endsWith("/a/b/stars.svg"));
  assert.ok(buildWidgetEmbed({ kind: "pypi_badge", packageName: "gitlytics" }).url.endsWith("/pypi/gitlytics.svg"));
  assert.ok(buildWidgetEmbed({ kind: "chart", owner: "a", repo: "b", metric: "views" }).url.endsWith("/chart/a/b/views.svg"));
  assert.throws(() => buildWidgetEmbed({ kind: "unknown" }));
  assert.throws(() => buildWidgetEmbed({ kind: "card" }));
});

test("local MCP server handles notifications, unknown methods/tools, and widget embed tool", async () => {
  assert.equal(
    await handleLocalJsonRpcMessage({ jsonrpc: "2.0", method: "notifications/initialized" }),
    null,
  );
  const badMethod = await handleLocalJsonRpcMessage({ jsonrpc: "2.0", id: 1, method: "nope/method" });
  assert.equal(badMethod.error.code, -32601);

  const badTool = await handleLocalJsonRpcMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "nonexistent_tool", arguments: {} },
  });
  assert.equal(badTool.error.code, -32602);

  const embedRes = await handleLocalJsonRpcMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "local_build_widget_embed", arguments: { kind: "tech_badge", slug: "nodejs", style: "icon_label" } },
  });
  assert.equal(embedRes.result.isError, false);
  assert.ok(embedRes.result.structuredContent.url.includes("/api/badge/tech.svg"));
});

test("CLI rejects unknown commands and malformed stars target", async () => {
  await assert.rejects(() => runCli(["not-a-command"]), /Unknown command/);
  await assert.rejects(() => runCli(["stars", "missing-slash"]), /Usage: gitlytics stars/);
  await assert.rejects(() => runCli(["mcp", "--mode", "invalid"]), /Invalid --mode/);
});

function invokeServer(server, { method = "GET", url = "/", body = "", headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = Readable.from(body ? [Buffer.from(body, "utf8")] : []);
    req.method = method;
    req.url = url;
    req.headers = { host: "127.0.0.1:8000", ...headers };

    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];
    const res = {
      writeHead(code, hdrs = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(hdrs)) {
          resHeaders[k.toLowerCase()] = v;
        }
      },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        resolve({
          status: statusCode,
          headers: resHeaders,
          text: Buffer.concat(chunks).toString("utf8"),
        });
      },
    };
    server.emit("request", req, res);
  });
}

test("local dashboard HTTP server serves health, traffic vault, HTML fallback, and security headers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-npm-http-"));
  const today = new Date().toISOString().slice(0, 10);
  mergeAndWriteVault(
    [{ date: today, repository: "ameyachopade/gitlytics", views: 44, unique_visitors: 22, clones: 7, unique_cloners: 5, stars: 10 }],
    { dataDir: dir },
  );

  const server = createDashboardServer({ dataDir: dir, host: "127.0.0.1" });
  try {
    const rHealth = await invokeServer(server, { method: "GET", url: "/api/health" });
    assert.equal(rHealth.status, 200);
    assert.equal(rHealth.headers["x-content-type-options"], "nosniff");
    assert.equal(rHealth.headers["x-frame-options"], "DENY");
    assert.equal(JSON.parse(rHealth.text).status, "ok");

    const rTraffic = await invokeServer(server, {
      method: "POST",
      url: "/api/traffic",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    });
    assert.equal(rTraffic.status, 200);
    assert.equal(JSON.parse(rTraffic.text).summary.total_views, 44);

    const rVault = await invokeServer(server, { method: "GET", url: "/api/local/vault" });
    assert.equal(rVault.status, 200);
    assert.equal(JSON.parse(rVault.text).summary.total_views, 44);

    const rHtml = await invokeServer(server, { method: "GET", url: "/" });
    assert.equal(rHtml.status, 200);
    assert.ok(rHtml.text.includes("Gitlytics"));

    const r404 = await invokeServer(server, { method: "DELETE", url: "/nope" });
    assert.equal(r404.status, 404);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
