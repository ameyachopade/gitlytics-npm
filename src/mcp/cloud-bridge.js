import readline from "node:readline";
import { DEFAULT_MCP_URL, VERSION } from "../version.js";

export function buildCloudHeaders(env = process.env) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "MCP-Protocol-Version": "2025-03-26",
    "User-Agent": `gitlytics-cli/${VERSION} (+https://gitlytics.dev)`,
  };
  const token = (env.GITLYTICS_API_KEY || env.GITLYTICS_OAUTH_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function forwardCloudJsonRpcLine(line, { url = DEFAULT_MCP_URL, env = process.env, fetchImpl = fetch } = {}) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: invalid JSON on stdin." },
    });
  }

  const reqId = parsed && typeof parsed === "object" && "id" in parsed ? parsed.id : null;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: buildCloudHeaders(env),
      body: JSON.stringify(parsed),
    });
  } catch (err) {
    if (reqId === null) return null;
    return JSON.stringify({
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32000, message: `Failed to reach Gitlytics MCP server: ${err.message}` },
    });
  }

  if (res.status === 202 || res.status === 204) return null;
  const text = await res.text();
  if (!text.trim()) {
    if (reqId === null) return null;
    return JSON.stringify({
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32000, message: `Empty response (HTTP ${res.status})` },
    });
  }

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    if (reqId === null) return null;
    return JSON.stringify({
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32000, message: `Non-JSON response (HTTP ${res.status})` },
    });
  }
}

export function runCloudMcpBridge({ url = DEFAULT_MCP_URL, env = process.env, input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const pending = [];
  rl.on("line", (line) => {
    const p = forwardCloudJsonRpcLine(line, { url, env })
      .then((reply) => {
        if (reply !== null) output.write(`${reply}\n`);
      })
      .catch((err) => {
        process.stderr.write(`[gitlytics mcp] ${err.message}\n`);
      });
    pending.push(p);
  });
  rl.on("close", async () => {
    await Promise.allSettled(pending);
  });
}
