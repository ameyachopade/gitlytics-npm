#!/usr/bin/env node
/**
 * Gitlytics CLI (Node 18+, zero dependencies).
 * Subcommands: fetch, sync, stars, mcp, dashboard
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { serializeCsvRows, writeFileAtomically } from "../src/csv-vault.js";
import { serveDashboard } from "../src/dashboard/server.js";
import { fetchStarHistory, fetchTraffic } from "../src/github.js";
import { sync } from "../src/index.js";
import { runCloudMcpBridge } from "../src/mcp/cloud-bridge.js";
import { runLocalMcpServer } from "../src/mcp/local-server.js";
import { validateOwnerRepo } from "../src/validation.js";
import { DEFAULT_MCP_URL, VERSION } from "../src/version.js";

function printHelp() {
  process.stderr.write(
    `gitlytics v${VERSION} - GitHub Traffic Analytics CLI, SDK & MCP Server\n\n` +
      `Usage:\n` +
      `  gitlytics fetch     [--token TOKEN] [--repo-name owner/repo] [--return-format timeseries|summary] [--save-file FILE]\n` +
      `  gitlytics sync      [--token TOKEN] [--repo-name owner/repo] [--data-dir ./data] [--output-mode monthly|yearly] [--public-only] [--export-json FILE]\n` +
      `  gitlytics stars     <owner/repo> [--token TOKEN] [--json]\n` +
      `  gitlytics mcp       [--mode cloud|local] [--data-dir ./data] [--url ${DEFAULT_MCP_URL}]\n` +
      `  gitlytics dashboard [--data-dir ./data] [--host 127.0.0.1] [--port 8000] [--public-bind]\n` +
      `  gitlytics --version\n`,
  );
}

function formatTable(rows) {
  if (!rows || rows.length === 0) return "(no rows)";
  const cols = ["date", "repository", "views", "unique_visitors", "clones", "unique_cloners", "stars"];
  const header = cols.join(" | ");
  const sep = cols.map((c) => "-".repeat(c.length)).join("-|-");
  const body = rows.map((r) => cols.map((c) => String(r[c] ?? "")).join(" | "));
  return [header, sep, ...body].join("\n");
}

export async function runCli(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printHelp();
    return 0;
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(`gitlytics ${VERSION}\n`);
    return 0;
  }

  const command = argv[0];
  const rest = argv.slice(1);

  if (command === "fetch") {
    const { values } = parseArgs({
      args: rest,
      options: {
        token: { type: "string", short: "t" },
        "repo-name": { type: "string" },
        "return-format": { type: "string", default: "timeseries" },
        "print-table": { type: "boolean", default: false },
        "save-file": { type: "string" },
        "public-only": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
    const result = await fetchTraffic({
      token: values.token || process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "",
      repoName: values["repo-name"] || null,
      returnFormat: values["return-format"],
      publicOnly: values["public-only"],
    });
    const payload = result.repositories || result.records || [];
    if (values["save-file"]) {
      const target = path.resolve(values["save-file"]);
      const out = target.endsWith(".csv") && result.records
        ? serializeCsvRows(result.records)
        : `${JSON.stringify(payload, null, 2)}\n`;
      writeFileAtomically(target, out);
      process.stderr.write(`Saved ${payload.length} row(s) to ${target}\n`);
    } else if (values["print-table"] && result.records) {
      process.stdout.write(`${formatTable(result.records)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    }
    return 0;
  }

  if (command === "sync") {
    const { values } = parseArgs({
      args: rest,
      options: {
        token: { type: "string", short: "t" },
        "repo-name": { type: "string" },
        "data-dir": { type: "string", default: "./data" },
        "output-mode": { type: "string", default: "monthly" },
        "public-only": { type: "boolean", default: false },
        "export-json": { type: "string" },
        "no-export-public-only": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
    const res = await sync({
      token: values.token || process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "",
      repoName: values["repo-name"] || null,
      dataDir: values["data-dir"],
      outputMode: values["output-mode"],
      publicOnly: values["public-only"],
      exportJson: values["export-json"] || null,
      exportPublicOnly: !values["no-export-public-only"],
    });
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    return 0;
  }

  if (command === "stars") {
    const { values, positionals } = parseArgs({
      args: rest,
      options: {
        token: { type: "string", short: "t" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    if (positionals.length < 1 || !positionals[0].includes("/")) {
      throw new Error("Usage: gitlytics stars <owner/repo> [--token TOKEN] [--json]");
    }
    const [owner, repo] = validateOwnerRepo(...positionals[0].split("/"));
    const points = await fetchStarHistory(owner, repo, {
      token: values.token || process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "",
    });
    if (values.json) {
      process.stdout.write(`${JSON.stringify(points, null, 2)}\n`);
    } else {
      const total = points.length > 0 ? points[points.length - 1].stars : 0;
      process.stdout.write(`${owner}/${repo}: ${total} stars across ${points.length} milestone day(s)\n`);
    }
    return 0;
  }

  if (command === "mcp") {
    const { values } = parseArgs({
      args: rest,
      options: {
        mode: { type: "string", default: "cloud" },
        "data-dir": { type: "string", default: "./data" },
        url: { type: "string", default: process.env.GITLYTICS_MCP_URL || DEFAULT_MCP_URL },
      },
      allowPositionals: false,
    });
    if (values.mode === "local") {
      runLocalMcpServer({ dataDir: values["data-dir"] });
    } else if (values.mode === "cloud") {
      runCloudMcpBridge({ url: values.url });
    } else {
      throw new Error(`Invalid --mode '${values.mode}'. Expected 'cloud' or 'local'.`);
    }
    return 0;
  }

  if (command === "dashboard") {
    const { values } = parseArgs({
      args: rest,
      options: {
        "data-dir": { type: "string", default: "./data" },
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "string", default: "8000" },
        "public-bind": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
    const { host, port } = await serveDashboard({
      dataDir: values["data-dir"],
      host: values.host,
      port: Number(values.port),
      publicBind: values["public-bind"],
    });
    process.stderr.write(`Gitlytics local dashboard running at http://${host}:${port}\n`);
    return 0;
  }

  throw new Error(`Unknown command '${command}'. Run 'gitlytics --help' for usage.`);
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url));
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
