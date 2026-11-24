import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeAndWriteVault } from "../src/csv-vault.js";
import { buildCloudHeaders, forwardCloudJsonRpcLine } from "../src/mcp/cloud-bridge.js";
import { handleLocalJsonRpcMessage, LOCAL_TOOLS } from "../src/mcp/local-server.js";

test("cloud MCP bridge forwards JSON-RPC and respects optional API key", async () => {
  assert.equal("Authorization" in buildCloudHeaders({}), false);
  assert.equal(buildCloudHeaders({ GITLYTICS_API_KEY: "glt_live_x" }).Authorization, "Bearer glt_live_x");

  const fakeFetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
  });
  const out = await forwardCloudJsonRpcLine(
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    { fetchImpl: fakeFetch },
  );
  assert.deepEqual(JSON.parse(out), { jsonrpc: "2.0", id: 1, result: { ok: true } });
});

test("local MCP server exposes 5 token-free tools, reads CSV vault, and blocks path traversal", async () => {
  // Security invariant: no tool schema may accept a raw token parameter
  for (const tool of LOCAL_TOOLS) {
    assert.equal("token" in (tool.inputSchema.properties || {}), false, `${tool.name} must not accept token`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-npm-mcp-"));
  try {
    const today = new Date().toISOString().slice(0, 10);
    mergeAndWriteVault(
      [{ date: today, repository: "ameyachopade/gitlytics", views: 77, unique_visitors: 33, clones: 9, unique_cloners: 6, stars: 10 }],
      { dataDir: dir },
    );

    const init = await handleLocalJsonRpcMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, { dataDir: dir });
    assert.equal(init.result.serverInfo.name, "gitlytics");

    const vaultRes = await handleLocalJsonRpcMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "local_query_csv_vault", arguments: {} } },
      { dataDir: dir },
    );
    assert.equal(vaultRes.result.isError, false);
    assert.equal(vaultRes.result.structuredContent.summary.total_views, 77);

    // Traversal blocked
    const badPath = await handleLocalJsonRpcMessage(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "local_query_csv_vault", arguments: { sub_dir: "../../etc" } } },
      { dataDir: dir },
    );
    assert.equal(badPath.result.isError, true);

    // Missing env token safely rejected
    const noTok = await handleLocalJsonRpcMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "local_fetch_traffic", arguments: {} } },
      { dataDir: dir, env: {} },
    );
    assert.equal(noTok.result.isError, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
