/**
 * Zero-dependency pure-Git offline repository analyzer (Node 18+).
 *
 * Security invariants:
 * - Executes `git` via execFileSync (never a shell) with strict argument arrays.
 * - Rejects null bytes and option-like paths starting with '-'.
 * - Supports optional `allowedRoot` containment for HTTP/MCP callers.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COMMIT_MARKER = "---GITLYTICS-COMMIT---";
const GIT_TIMEOUT_MS = 20_000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

function runGit(repoDir, args) {
  try {
    return execFileSync("git", ["-C", repoDir, ...args], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error("git executable not found on PATH.");
    }
    const stderr = err && err.stderr ? String(err.stderr).trim() : "";
    throw new Error(stderr || (err instanceof Error ? err.message : "git command failed."));
  }
}

function isoWeekKey(isoString) {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return null;
  const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function computeBusFactor(rankedAuthors, totalCommits) {
  if (totalCommits <= 0 || rankedAuthors.length === 0) return 0;
  const threshold = totalCommits * 0.5;
  let acc = 0;
  for (let i = 0; i < rankedAuthors.length; i += 1) {
    acc += rankedAuthors[i][1];
    if (acc >= threshold) return i + 1;
  }
  return rankedAuthors.length;
}

function buildAgentPrompt({ repoName, days, totalCommits, busFactor, activeAuthors, hotspots }) {
  const lines = [
    `Audit local Git repository \`${repoName}\` (last ${days} days: ${totalCommits} commits, ${activeAuthors} contributor(s), bus factor ${busFactor}).`,
  ];
  if (hotspots.length > 0) {
    const topFiles = hotspots
      .slice(0, 3)
      .map((h) => `\`${h.file}\` (${h.touches} touches)`)
      .join(", ");
    lines.push(
      `1. Inspect the highest-churn hotspot files (${topFiles}) for tangled responsibilities, missing tests, or regression risks, and propose focused refactors.`,
    );
  }
  if (busFactor <= 1 && totalCommits >= 5) {
    lines.push(
      "2. Document key architecture entrypoints and add automated smoke tests around critical modules to reduce single-maintainer bus-factor risk.",
    );
  } else {
    lines.push(
      "2. Summarize recent engineering velocity and flag any modules showing repeated bug-fix churn.",
    );
  }
  return lines.join("\n");
}

function isWithinRoot(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function analyzeLocalRepo({
  repoPath = ".",
  days = 90,
  maxHotspots = 10,
  allowedRoot = null,
} = {}) {
  const raw = String(repoPath || ".").trim();
  if (!raw || raw.includes("\0")) {
    throw new Error("Invalid repository path.");
  }
  if (raw.startsWith("-")) {
    throw new Error("Repository path must not start with '-'.");
  }

  const safeDays = Math.max(1, Math.min(Number(days) || 90, 3650));
  const safeMaxHotspots = Math.max(1, Math.min(Number(maxHotspots) || 10, 50));

  let candidate;
  if (allowedRoot) {
    const rootResolved = path.resolve(allowedRoot);
    candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(rootResolved, raw);
    if (!isWithinRoot(candidate, rootResolved)) {
      throw new Error("Requested path is outside the allowed local workspace directory.");
    }
  } else {
    candidate = path.resolve(raw);
  }

  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    throw new Error(`Directory does not exist: ${candidate}`);
  }

  const toplevel = path.resolve(runGit(candidate, ["rev-parse", "--show-toplevel"]).trim());
  const branch = runGit(toplevel, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "HEAD";
  const logOutput = runGit(toplevel, [
    "log",
    `--since=${safeDays}.days.ago`,
    "--no-merges",
    `--format=${COMMIT_MARKER}%n%H%x09%aN%x09%aI`,
    "--name-only",
  ]);

  const authorCounts = new Map();
  const fileCounts = new Map();
  const weekCounts = new Map();
  let totalCommits = 0;

  const blocks = logOutput.split(COMMIT_MARKER);
  for (let i = 1; i < blocks.length; i += 1) {
    const lines = blocks[i]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const header = lines[0].split("\t");
    if (header.length < 3) continue;

    const authorName = header[1].trim() || "Unknown";
    const isoDate = header[2].trim();
    totalCommits += 1;
    authorCounts.set(authorName, (authorCounts.get(authorName) || 0) + 1);

    const wk = isoWeekKey(isoDate);
    if (wk) weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);

    for (let j = 1; j < lines.length; j += 1) {
      const file = lines[j];
      if (file) fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }

  const rankedAuthors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const activeAuthors = rankedAuthors.length;
  const busFactor = computeBusFactor(rankedAuthors, totalCommits);
  const commitsPerWeek = Number(((totalCommits / safeDays) * 7).toFixed(2));

  const topAuthors = rankedAuthors.slice(0, 10).map(([author, commits]) => ({
    author,
    commits,
    share_pct: totalCommits > 0 ? Number(((commits / totalCommits) * 100).toFixed(1)) : 0,
  }));

  const hotspots = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, safeMaxHotspots)
    .map(([file, touches]) => ({ file, touches }));

  const weeklyCommits = [...weekCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, commits]) => ({ week, commits }));

  const repoName = path.basename(toplevel);
  return {
    path: toplevel,
    repo_name: repoName,
    branch,
    days: safeDays,
    total_commits: totalCommits,
    active_authors: activeAuthors,
    bus_factor: busFactor,
    commits_per_week: commitsPerWeek,
    top_authors: topAuthors,
    hotspots,
    weekly_commits: weeklyCommits,
    agent_prompt: buildAgentPrompt({
      repoName,
      days: safeDays,
      totalCommits,
      busFactor,
      activeAuthors,
      hotspots,
    }),
  };
}
