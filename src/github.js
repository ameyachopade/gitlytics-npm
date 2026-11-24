/**
 * Zero-dependency GitHub REST API client (Node 18+ built-in fetch).
 */

import {
  GitHubAPIError,
  GitHubRateLimitError,
  NoTrafficDataError,
  StargazersRestrictedError,
  StarHistoryFetchError,
  TokenExpiredError,
} from "./exceptions.js";
import { parseRepoList, validateOwnerRepo } from "./validation.js";
import { GITHUB_API_BASE, VERSION } from "./version.js";

function buildGithubHeaders(token, accept = "application/vnd.github+json") {
  const headers = {
    Accept: accept,
    "User-Agent": `gitlytics-js/${VERSION} (+https://gitlytics.dev)`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubJson(url, { token, accept, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: buildGithubHeaders(token, accept) });
  if (res.status === 401) {
    throw new TokenExpiredError();
  }
  if (res.status === 403) {
    const remaining = res.headers?.get?.("x-ratelimit-remaining");
    const reset = res.headers?.get?.("x-ratelimit-reset");
    if (remaining === "0") {
      throw new GitHubRateLimitError("GitHub API rate limit exceeded.", reset ? Number(reset) : null);
    }
    throw new GitHubAPIError(`GitHub API forbidden (403) for ${url}`, 403);
  }
  if (!res.ok) {
    throw new GitHubAPIError(`GitHub API returned HTTP ${res.status} for ${url}`, res.status);
  }
  return res.json();
}

export async function listUserRepos({ token, publicOnly = false, fetchImpl = fetch } = {}) {
  if (!token) throw new TokenExpiredError("A GitHub token is required to list repositories.");
  const visibility = publicOnly ? "public" : "all";
  const url = `${GITHUB_API_BASE}/user/repos?per_page=100&visibility=${visibility}&affiliation=owner,collaborator`;
  const repos = await githubJson(url, { token, fetchImpl });
  return Array.isArray(repos) ? repos : [];
}

export async function fetchRepoTrafficRecords(
  owner,
  repo,
  { token, metrics = null, fetchImpl = fetch } = {},
) {
  const [cleanOwner, cleanRepo] = validateOwnerRepo(owner, repo);
  const fullName = `${cleanOwner}/${cleanRepo}`;
  const base = `${GITHUB_API_BASE}/repos/${cleanOwner}/${cleanRepo}`;
  const wanted = new Set(
    (metrics && metrics.length > 0
      ? metrics
      : ["views", "clones", "referrers", "paths", "stars", "forks", "releases"]
    ).map((m) => String(m).toLowerCase()),
  );

  const meta = await githubJson(base, { token, fetchImpl });
  const viewsResp = wanted.has("views")
    ? await githubJson(`${base}/traffic/views`, { token, fetchImpl })
    : { views: [] };
  const clonesResp = wanted.has("clones")
    ? await githubJson(`${base}/traffic/clones`, { token, fetchImpl })
    : { clones: [] };
  const referrersResp = wanted.has("referrers")
    ? await githubJson(`${base}/traffic/popular/referrers`, { token, fetchImpl }).catch(() => [])
    : [];
  const pathsResp = wanted.has("paths")
    ? await githubJson(`${base}/traffic/popular/paths`, { token, fetchImpl }).catch(() => [])
    : [];
  const releasesResp = wanted.has("releases")
    ? await githubJson(`${base}/releases?per_page=100`, { token, fetchImpl }).catch(() => [])
    : [];

  const byDate = new Map();
  for (const v of viewsResp.views || []) {
    const d = String(v.timestamp || "").slice(0, 10);
    if (!d) continue;
    byDate.set(d, {
      date: d,
      views: Number(v.count || 0),
      unique_visitors: Number(v.uniques || 0),
      clones: 0,
      unique_cloners: 0,
    });
  }
  for (const c of clonesResp.clones || []) {
    const d = String(c.timestamp || "").slice(0, 10);
    if (!d) continue;
    const entry = byDate.get(d) || {
      date: d,
      views: 0,
      unique_visitors: 0,
      clones: 0,
      unique_cloners: 0,
    };
    entry.clones = Number(c.count || 0);
    entry.unique_cloners = Number(c.uniques || 0);
    byDate.set(d, entry);
  }

  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) {
    throw new NoTrafficDataError(`No traffic rows returned for ${fullName}.`);
  }

  const topRef = Array.isArray(referrersResp) && referrersResp.length > 0 ? referrersResp[0] : {};
  const topPath = Array.isArray(pathsResp) && pathsResp.length > 0 ? pathsResp[0] : {};
  const latestDate = dates[dates.length - 1];
  const topicsStr = Array.isArray(meta.topics) ? meta.topics.join(";") : "";

  const records = dates.map((d) => {
    const row = byDate.get(d);
    const isLatest = d === latestDate;
    return {
      date: d,
      repository: fullName,
      views: row.views,
      unique_visitors: row.unique_visitors,
      clones: row.clones,
      unique_cloners: row.unique_cloners,
      stars: Number(meta.stargazers_count || 0),
      forks: Number(meta.forks_count || 0),
      releases: Array.isArray(releasesResp) ? releasesResp.length : 0,
      language: meta.language || "",
      topics: topicsStr,
      watchers_count: Number(meta.subscribers_count ?? meta.watchers_count ?? 0),
      created_at: meta.created_at || "",
      open_issues_count: Number(meta.open_issues_count || 0),
      top_referrer: isLatest ? topRef.referrer || "" : "",
      top_referrer_views: isLatest ? Number(topRef.count || 0) : 0,
      top_referrer_uniques: isLatest ? Number(topRef.uniques || 0) : 0,
      _raw_referrers: isLatest ? JSON.stringify(referrersResp || []) : "[]",
      top_path: isLatest ? topPath.path || "" : "",
      top_path_views: isLatest ? Number(topPath.count || 0) : 0,
      top_path_uniques: isLatest ? Number(topPath.uniques || 0) : 0,
      _raw_paths: isLatest ? JSON.stringify(pathsResp || []) : "[]",
    };
  });

  return { records, isPrivate: Boolean(meta.private) };
}

export async function fetchTraffic({
  token = process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "",
  repoName = null,
  metrics = null,
  returnFormat = "timeseries",
  publicOnly = false,
  fetchImpl = fetch,
} = {}) {
  if (!token) {
    throw new TokenExpiredError("Missing GitHub token. Pass { token } or set GITLYTICS_TOKEN.");
  }

  let targets = parseRepoList(repoName);
  if (!targets) {
    const repos = await listUserRepos({ token, publicOnly, fetchImpl });
    targets = repos.map((r) => r.full_name).filter(Boolean);
  }

  const allRecords = [];
  const privateRepos = new Set();
  for (const fullName of targets) {
    const [owner, repo] = fullName.split("/");
    try {
      const { records, isPrivate } = await fetchRepoTrafficRecords(owner, repo, {
        token,
        metrics,
        fetchImpl,
      });
      if (isPrivate) privateRepos.add(fullName.toLowerCase());
      if (publicOnly && isPrivate) continue;
      allRecords.push(...records);
    } catch (err) {
      if (err instanceof NoTrafficDataError) continue;
      throw err;
    }
  }

  if (returnFormat === "summary") {
    const byRepo = new Map();
    for (const r of allRecords) {
      const curr = byRepo.get(r.repository) || {
        repository: r.repository,
        views: 0,
        unique_visitors: 0,
        clones: 0,
        unique_cloners: 0,
        stars: r.stars,
        forks: r.forks,
        days: 0,
      };
      curr.views += r.views;
      curr.unique_visitors += r.unique_visitors;
      curr.clones += r.clones;
      curr.unique_cloners += r.unique_cloners;
      curr.stars = r.stars;
      curr.forks = r.forks;
      curr.days += 1;
      byRepo.set(r.repository, curr);
    }
    return { repositories: Array.from(byRepo.values()), privateRepos };
  }

  return { records: allRecords, privateRepos };
}

export async function fetchStarHistory(
  owner,
  repo,
  { token = process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "", maxPages = 10, fetchImpl = fetch } = {},
) {
  const [cleanOwner, cleanRepo] = validateOwnerRepo(owner, repo);
  const countsByDate = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${GITHUB_API_BASE}/repos/${cleanOwner}/${cleanRepo}/stargazers?per_page=100&page=${page}`;
    let data;
    try {
      data = await githubJson(url, {
        token,
        accept: "application/vnd.github.star+json",
        fetchImpl,
      });
    } catch (err) {
      if (err instanceof GitHubAPIError && err.statusCode === 403 && !(err instanceof GitHubRateLimitError)) {
        throw new StargazersRestrictedError(err.message);
      }
      if (err instanceof GitHubAPIError) {
        throw new StarHistoryFetchError(err.message, err.statusCode);
      }
      throw err;
    }
    if (!Array.isArray(data) || data.length === 0) break;
    for (const item of data) {
      const d = String(item.starred_at || "").slice(0, 10);
      if (!d) continue;
      countsByDate.set(d, (countsByDate.get(d) || 0) + 1);
    }
    if (data.length < 100) break;
  }

  let cumulative = 0;
  return Array.from(countsByDate.keys())
    .sort()
    .map((date) => {
      cumulative += countsByDate.get(date);
      return { date, stars: cumulative };
    });
}
