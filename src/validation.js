import path from "node:path";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function validateOwnerRepo(owner, repo) {
  const cleanOwner = String(owner ?? "").trim();
  const cleanRepo = String(repo ?? "").trim();
  if (!OWNER_RE.test(cleanOwner)) {
    throw new Error(`Invalid GitHub owner: ${JSON.stringify(owner)}`);
  }
  if (!REPO_RE.test(cleanRepo) || cleanRepo === "." || cleanRepo === ".." || cleanRepo.includes("..")) {
    throw new Error(`Invalid GitHub repository name: ${JSON.stringify(repo)}`);
  }
  return [cleanOwner, cleanRepo];
}

export function parseRepoList(repoArg) {
  if (!repoArg) return null;
  const raw = Array.isArray(repoArg) ? repoArg : String(repoArg).split(",");
  const cleaned = [];
  for (const item of raw) {
    const trimmed = String(item).trim();
    if (!trimmed) continue;
    const parts = trimmed.split("/");
    if (parts.length !== 2) {
      throw new Error(`Invalid repo name ${JSON.stringify(trimmed)}: expected 'owner/repo' format.`);
    }
    const [owner, repo] = validateOwnerRepo(parts[0], parts[1]);
    cleaned.push(`${owner}/${repo}`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

export function resolveContainedPath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes allowed data directory: ${targetPath}`);
  }
  return resolvedTarget;
}

export function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  let str = typeof value === "string" ? value : String(value);
  if (FORMULA_PREFIX_RE.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function isLoopbackHost(host) {
  const normalized = String(host ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(normalized);
}
