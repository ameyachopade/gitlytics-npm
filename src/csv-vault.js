/**
 * 22-column Gitlytics CSV vault engine (100% interoperable with Python `gitlytics`).
 * Supports monthly (traffic_YYYY-MM.csv) and yearly (traffic_YYYY.csv) partitioning,
 * (date, repository) deduplication, RFC 4180 CSV parsing, atomic temp-file writes,
 * and public-only JSON exports.
 */

import fs from "node:fs";
import path from "node:path";
import { escapeCsvCell, resolveContainedPath } from "./validation.js";

export const CSV_COLUMNS = [
  "date",
  "repository",
  "views",
  "unique_visitors",
  "clones",
  "unique_cloners",
  "stars",
  "forks",
  "releases",
  "language",
  "topics",
  "watchers_count",
  "created_at",
  "open_issues_count",
  "top_referrer",
  "top_referrer_views",
  "top_referrer_uniques",
  "_raw_referrers",
  "top_path",
  "top_path_views",
  "top_path_uniques",
  "_raw_paths",
];

const INT_COLUMNS = new Set([
  "views",
  "unique_visitors",
  "clones",
  "unique_cloners",
  "stars",
  "forks",
  "releases",
  "watchers_count",
  "open_issues_count",
  "top_referrer_views",
  "top_referrer_uniques",
  "top_path_views",
  "top_path_uniques",
]);

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const obj = {};
    for (let j = 0; j < header.length; j += 1) {
      const col = header[j];
      const rawVal = cells[j] ?? "";
      if (INT_COLUMNS.has(col)) {
        const parsed = Number.parseInt(rawVal, 10);
        obj[col] = Number.isFinite(parsed) ? parsed : 0;
      } else {
        obj[col] = rawVal;
      }
    }
    records.push(obj);
  }
  return records;
}

export function serializeCsvRows(records) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const rec of records) {
    const line = CSV_COLUMNS.map((col) => escapeCsvCell(rec[col] ?? "")).join(",");
    lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}

export function writeFileAtomically(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function partitionFilename(dateStr, outputMode = "monthly") {
  const clean = String(dateStr).slice(0, 10);
  if (outputMode === "yearly") {
    return `traffic_${clean.slice(0, 4)}.csv`;
  }
  return `traffic_${clean.slice(0, 7)}.csv`;
}

export function mergeAndWriteVault(records, { dataDir = "./data", outputMode = "monthly" } = {}) {
  const resolvedDir = path.resolve(dataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const grouped = new Map();
  for (const rec of records) {
    if (!rec.date || !rec.repository) continue;
    const fname = partitionFilename(rec.date, outputMode);
    if (!grouped.has(fname)) grouped.set(fname, []);
    grouped.get(fname).push(rec);
  }

  const writtenFiles = [];
  let totalRows = 0;

  for (const [fname, incoming] of grouped.entries()) {
    const fullPath = resolveContainedPath(resolvedDir, fname);
    const existing = fs.existsSync(fullPath)
      ? parseCsvText(fs.readFileSync(fullPath, "utf8"))
      : [];

    const byKey = new Map();
    for (const row of existing) {
      byKey.set(`${row.date}|${String(row.repository).toLowerCase()}`, row);
    }
    for (const row of incoming) {
      byKey.set(`${row.date}|${String(row.repository).toLowerCase()}`, row);
    }

    const merged = Array.from(byKey.values()).sort((a, b) => {
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
      return String(a.repository).localeCompare(String(b.repository));
    });

    writeFileAtomically(fullPath, serializeCsvRows(merged));
    writtenFiles.push(fullPath);
    totalRows += merged.length;
  }

  return { files: writtenFiles, totalRows };
}

export function queryCsvVault({ dataDir = "./data", repoName = null, days = 90 } = {}) {
  const resolvedDir = path.resolve(dataDir);
  if (!fs.existsSync(resolvedDir)) {
    return {
      data_dir: resolvedDir,
      files_scanned: 0,
      row_count: 0,
      repositories: [],
      summary: { total_views: 0, total_unique_visitors: 0, total_clones: 0, total_unique_cloners: 0 },
      rows: [],
    };
  }

  const entries = fs
    .readdirSync(resolvedDir)
    .filter((f) => /^traffic_.*\.csv$/i.test(f))
    .sort();

  const targetLower = repoName ? String(repoName).trim().toLowerCase() : null;
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) : null;

  const allRows = [];
  for (const fname of entries) {
    const fullPath = resolveContainedPath(resolvedDir, fname);
    const rows = parseCsvText(fs.readFileSync(fullPath, "utf8"));
    for (const r of rows) {
      if (targetLower && String(r.repository || "").toLowerCase() !== targetLower) continue;
      if (cutoff && String(r.date || "") < cutoff) continue;
      allRows.push(r);
    }
  }

  allRows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  const repoSet = new Set();
  let totalViews = 0;
  let totalVisitors = 0;
  let totalClones = 0;
  let totalCloners = 0;
  for (const r of allRows) {
    if (r.repository) repoSet.add(r.repository);
    totalViews += Number(r.views || 0);
    totalVisitors += Number(r.unique_visitors || 0);
    totalClones += Number(r.clones || 0);
    totalCloners += Number(r.unique_cloners || 0);
  }

  return {
    data_dir: resolvedDir,
    files_scanned: entries.length,
    row_count: allRows.length,
    repositories: Array.from(repoSet).sort(),
    summary: {
      total_views: totalViews,
      total_unique_visitors: totalVisitors,
      total_clones: totalClones,
      total_unique_cloners: totalCloners,
      clone_to_visitor_ratio: totalVisitors > 0 ? Number((totalClones / totalVisitors).toFixed(3)) : 0,
    },
    rows: allRows,
  };
}

export function exportVaultToJson({
  dataDir = "./data",
  outputPath,
  exportPublicOnly = true,
  privateRepos = new Set(),
} = {}) {
  const vault = queryCsvVault({ dataDir, days: 0 });
  const filtered = exportPublicOnly
    ? vault.rows.filter((r) => !privateRepos.has(String(r.repository || "").toLowerCase()))
    : vault.rows;
  writeFileAtomically(path.resolve(outputPath), `${JSON.stringify(filtered, null, 2)}\n`);
  return { path: path.resolve(outputPath), rowCount: filtered.length };
}
