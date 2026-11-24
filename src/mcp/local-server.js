/**
 * Zero-dependency local stdio MCP 2025-03-26 server mirroring Python `gitlytics mcp`.
 *
 * Security invariants:
 * - Tool schemas NEVER accept raw GitHub tokens (preventing secrets in chat transcripts).
 * - Live GitHub calls read GITLYTICS_TOKEN / GITHUB_TOKEN strictly from process.env.
 * - CSV vault queries enforce strict path containment under `dataDir`.
 * - stdout is reserved exclusively for JSON-RPC 2.0 lines.
 */

import readline from "node:readline";
import { mergeAndWriteVault, queryCsvVault } from "../csv-vault.js";
import { fetchStarHistory, fetchTraffic } from "../github.js";
import { resolveContainedPath, validateOwnerRepo } from "../validation.js";
import { VERSION } from "../version.js";
import { buildWidgetEmbed } from "../widgets.js";

export const LOCAL_TOOLS = [
  {
    name: "local_query_csv_vault",
    description: "Read and summarize local Gitlytics traffic_*.csv archive files offline.",
    inputSchema: {
      type: "object",
      properties: {
        repo_name: { type: "string", description: "Optional owner/repo filter." },
        days: { type: "integer", minimum: 0, maximum: 3650, default: 90 },
        sub_dir: { type: "string", description: "Optional relative subdirectory inside data-dir." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "local_fetch_traffic",
    description: "Fetch live 14-day GitHub traffic using GITLYTICS_TOKEN or GITHUB_TOKEN from env.",
    inputSchema: {
      type: "object",
      properties: {
        repo_name: { type: "string", description: "Comma-separated owner/repo list (optional)." },
        return_format: { type: "string", enum: ["timeseries", "summary"], default: "summary" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "local_sync_archive",
    description: "Fetch GitHub traffic via env token and merge into local monthly/yearly CSV vault.",
    inputSchema: {
      type: "object",
      properties: {
        repo_name: { type: "string", description: "Optional owner/repo or comma-separated list." },
        output_mode: { type: "string", enum: ["monthly", "yearly"], default: "monthly" },
        public_only: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "local_star_history",
    description: "Fetch cumulative GitHub star history for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
      additionalProperties: false,
    },
  },
  {
    name: "local_build_widget_embed",
    description: "Build hosted api.gitlytics.dev SVG URL, Markdown, and HTML embed snippets.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["card", "tech_badge", "static_badge", "live_badge", "pypi_badge", "chart"] },
        username: { type: "string" },
        card_type: { type: "string" },
        owner: { type: "string" },
        repo: { type: "string" },
        metric: { type: "string" },
        package_name: { type: "string" },
        slug: { type: "string" },
        label: { type: "string" },
        message: { type: "string" },
        value: { type: "string" },
        theme: { type: "string" },
        variant: { type: "string" },
        shape: { type: "string" },
        style: { type: "string" },
        color: { type: "string" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
];

function toolResponse(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}

export async function handleLocalJsonRpcMessage(msg, { dataDir = "./data", env = process.env, fetchImpl = fetch } = {}) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || !msg.method) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  }
  const reqId = "id" in msg ? msg.id : null;
  if (reqId === null) return null;

  const { method, params = {} } = msg;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: reqId,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "gitlytics", version: VERSION },
      },
    };
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id: reqId, result: {} };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id: reqId, result: { tools: LOCAL_TOOLS } };
  }
  if (method === "tools/call") {
    const name = String(params.name || "");
    const args = params.arguments || {};
    const token = (env.GITLYTICS_TOKEN || env.GITHUB_TOKEN || "").trim();

    try {
      if (name === "local_query_csv_vault") {
        const targetDir = args.sub_dir ? resolveContainedPath(dataDir, args.sub_dir) : dataDir;
        const result = queryCsvVault({
          dataDir: targetDir,
          repoName: args.repo_name || null,
          days: args.days ?? 90,
        });
        return { jsonrpc: "2.0", id: reqId, result: toolResponse(result) };
      }

      if (name === "local_fetch_traffic") {
        if (!token) {
          return {
            jsonrpc: "2.0",
            id: reqId,
            result: toolResponse(
              { error: "Missing GITLYTICS_TOKEN or GITHUB_TOKEN in process environment." },
              true,
            ),
          };
        }
        const res = await fetchTraffic({
          token,
          repoName: args.repo_name || null,
          returnFormat: args.return_format || "summary",
          fetchImpl,
        });
        return {
          jsonrpc: "2.0",
          id: reqId,
          result: toolResponse({
            repositories: res.repositories || undefined,
            records: res.records || undefined,
          }),
        };
      }

      if (name === "local_sync_archive") {
        if (!token) {
          return {
            jsonrpc: "2.0",
            id: reqId,
            result: toolResponse(
              { error: "Missing GITLYTICS_TOKEN or GITHUB_TOKEN in process environment." },
              true,
            ),
          };
        }
        const { records } = await fetchTraffic({
          token,
          repoName: args.repo_name || null,
          publicOnly: Boolean(args.public_only),
          fetchImpl,
        });
        const written = mergeAndWriteVault(records, {
          dataDir,
          outputMode: args.output_mode || "monthly",
        });
        return {
          jsonrpc: "2.0",
          id: reqId,
          result: toolResponse({ synced_records: records.length, ...written }),
        };
      }

      if (name === "local_star_history") {
        const [owner, repo] = validateOwnerRepo(args.owner, args.repo);
        const points = await fetchStarHistory(owner, repo, { token, fetchImpl });
        return {
          jsonrpc: "2.0",
          id: reqId,
          result: toolResponse({
            repository: `${owner}/${repo}`,
            points_count: points.length,
            latest_stars: points.length > 0 ? points[points.length - 1].stars : 0,
            points,
          }),
        };
      }

      if (name === "local_build_widget_embed") {
        const embed = buildWidgetEmbed({
          kind: args.kind,
          username: args.username,
          cardType: args.card_type,
          owner: args.owner,
          repo: args.repo,
          metric: args.metric,
          packageName: args.package_name,
          slug: args.slug,
          label: args.label,
          message: args.message,
          value: args.value,
          theme: args.theme,
          variant: args.variant,
          shape: args.shape,
          style: args.style,
          color: args.color,
        });
        return { jsonrpc: "2.0", id: reqId, result: toolResponse(embed) };
      }

      return { jsonrpc: "2.0", id: reqId, error: { code: -32602, message: `Unknown tool: ${name}` } };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: reqId,
        result: toolResponse({ error: err instanceof Error ? err.message : String(err) }, true),
      };
    }
  }

  return { jsonrpc: "2.0", id: reqId, error: { code: -32601, message: `Method not found: ${method}` } };
}

export function runLocalMcpServer({ dataDir = "./data", env = process.env, input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const pending = [];
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      output.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
      );
      return;
    }
    const task = handleLocalJsonRpcMessage(parsed, { dataDir, env })
      .then((res) => {
        if (res !== null) output.write(`${JSON.stringify(res)}\n`);
      })
      .catch((err) => {
        process.stderr.write(`[gitlytics mcp] ${err.message}\n`);
      });
    pending.push(task);
  });
  rl.on("close", async () => {
    await Promise.allSettled(pending);
  });
}
