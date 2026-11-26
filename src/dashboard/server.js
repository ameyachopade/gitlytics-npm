/**
 * Zero-dependency loopback local dashboard server (Node built-in `node:http`).
 *
 * Security parity with Python `gitlytics dashboard`:
 * - Binds to 127.0.0.1 by default; non-loopback hosts require `publicBind: true`.
 * - Drops pre-configured tokens automatically when `publicBind: true`.
 * - Enforces 5 MiB request body cap and security response headers.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryCsvVault } from "../csv-vault.js";
import { analyzeLocalRepo } from "../local-git.js";
import { isLoopbackHost } from "../validation.js";
import { VERSION } from "../version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "..", "..", "static");
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; object-src 'none'",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function renderFallbackHtml(dataDir) {
  const vault = queryCsvVault({ dataDir, days: 365 });
  const rowsHtml = vault.repositories
    .map((repo) => `<li><code>${repo.replace(/[<>&"]/g, "")}</code></li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Gitlytics Local Dashboard (Node)</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b0b0f; color: #f4f4f5; max-width: 760px; margin: 48px auto; padding: 0 20px; }
    .card { background: #14141b; border: 1px solid #272732; border-radius: 14px; padding: 20px; margin-top: 16px; }
    code { background: #1e1e2a; padding: 2px 6px; border-radius: 6px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
    .stat { background: #1a1a24; border-radius: 10px; padding: 14px; }
    .val { font-size: 22px; font-weight: 700; color: #f97316; }
    .lbl { font-size: 12px; color: #a1a1aa; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Gitlytics Local Vault (v${VERSION})</h1>
  <p>Reading local CSV archives from <code>${dataDir.replace(/[<>&"]/g, "")}</code>.</p>
  <div class="grid">
    <div class="stat"><div class="val">${vault.summary.total_views}</div><div class="lbl">Views</div></div>
    <div class="stat"><div class="val">${vault.summary.total_unique_visitors}</div><div class="lbl">Unique Visitors</div></div>
    <div class="stat"><div class="val">${vault.summary.total_clones}</div><div class="lbl">Clones</div></div>
    <div class="stat"><div class="val">${vault.summary.total_unique_cloners}</div><div class="lbl">Unique Cloners</div></div>
  </div>
  <div class="card">
    <h3>Archived Repositories (${vault.repositories.length})</h3>
    <ul>${rowsHtml || "<li>No traffic_*.csv files found yet. Run <code>npx gitlytics sync</code> first.</li>"}</ul>
  </div>
</body>
</html>`;
}

function isAllowedLocalOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function createDashboardServer({
  dataDir = "./data",
  host = "127.0.0.1",
  publicBind = false,
} = {}) {
  if (!isLoopbackHost(host) && !publicBind) {
    throw new Error(
      `Refusing to bind to non-loopback host '${host}' without --public-bind. ` +
        `Pass --public-bind explicitly if you intend to expose the local dashboard.`,
    );
  }

  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", version: VERSION, mode: "local-node" });
    }

    if (req.method === "GET" && pathname === "/api/config") {
      return sendJson(res, 200, {
        has_token: Boolean(!publicBind && (process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN)),
        has_data_dir: Boolean(dataDir),
        mode: "local-node",
      });
    }

    if (req.method === "GET" && pathname === "/api/local/vault") {
      if (!isAllowedLocalOrigin(req)) {
        return sendJson(res, 403, { detail: "Cross-origin access forbidden." });
      }
      const vault = queryCsvVault({ dataDir, days: 365 });
      return sendJson(res, 200, {
        data_dir: dataDir,
        repositories: vault.repositories || [],
        summary: vault.summary || {
          total_views: 0,
          total_unique_visitors: 0,
          total_clones: 0,
          total_unique_cloners: 0,
        },
        traffic: [],
      });
    }

    if (req.method === "POST" && pathname === "/api/local/analyze") {
      if (!isAllowedLocalOrigin(req)) {
        return sendJson(res, 403, { detail: "Cross-origin access forbidden." });
      }
      try {
        const raw = await readBody(req);
        const body = raw.trim() ? JSON.parse(raw) : {};
        const allowedRoot = path.resolve(process.env.GITLYTICS_ANALYZE_ROOT || process.cwd());
        const report = analyzeLocalRepo({
          repoPath: body.path || ".",
          days: Number(body.days ?? 90),
          allowedRoot,
        });
        return sendJson(res, 200, report);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { detail: err instanceof Error ? err.message : String(err) });
      }
    }

    if (req.method === "POST" && pathname === "/api/traffic") {
      try {
        const raw = await readBody(req);
        const body = raw.trim() ? JSON.parse(raw) : {};
        const vault = queryCsvVault({
          dataDir,
          repoName: body.repo_name || null,
          days: Number(body.days ?? 90),
        });
        return sendJson(res, 200, vault);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { detail: err.message });
      }
    }

    if (req.method === "GET") {
      if (fs.existsSync(path.join(STATIC_DIR, "index.html"))) {
        const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const candidate = path.resolve(STATIC_DIR, rel);
        if (candidate.startsWith(STATIC_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
          });
          res.end(fs.readFileSync(candidate));
          return;
        }
      }
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" });
      res.end(renderFallbackHtml(dataDir));
      return;
    }

    sendJson(res, 404, { detail: "Not found" });
  });
}

export function serveDashboard({
  dataDir = "./data",
  host = "127.0.0.1",
  port = 8000,
  publicBind = false,
} = {}) {
  const server = createDashboardServer({ dataDir, host, publicBind });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, host, port: typeof addr === "object" && addr ? addr.port : port });
    });
  });
}
