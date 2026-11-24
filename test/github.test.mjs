import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildWidgetEmbed,
  fetchStarHistory,
  fetchTraffic,
  GitHubRateLimitError,
  sync,
  TokenExpiredError,
} from "../src/index.js";

function makeMockFetch() {
  return async (url) => {
    if (url.endsWith("/repos/octocat/demo")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          full_name: "octocat/demo",
          private: false,
          stargazers_count: 100,
          forks_count: 15,
          language: "TypeScript",
          topics: ["mcp", "analytics"],
          subscribers_count: 10,
          created_at: "2024-01-01T00:00:00Z",
          open_issues_count: 2,
        }),
      };
    }
    if (url.endsWith("/traffic/views")) {
      return { ok: true, status: 200, json: async () => ({ views: [{ timestamp: "2026-11-23T00:00:00Z", count: 120, uniques: 60 }] }) };
    }
    if (url.endsWith("/traffic/clones")) {
      return { ok: true, status: 200, json: async () => ({ clones: [{ timestamp: "2026-11-23T00:00:00Z", count: 30, uniques: 20 }] }) };
    }
    if (url.endsWith("/traffic/popular/referrers")) {
      return { ok: true, status: 200, json: async () => [{ referrer: "github.com", count: 80, uniques: 40 }] };
    }
    if (url.endsWith("/traffic/popular/paths")) {
      return { ok: true, status: 200, json: async () => [{ path: "/octocat/demo", count: 90, uniques: 50 }] };
    }
    if (url.includes("/releases")) {
      return { ok: true, status: 200, json: async () => [{ id: 1 }, { id: 2 }] };
    }
    if (url.includes("/stargazers")) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { starred_at: "2026-11-01T10:00:00Z" },
          { starred_at: "2026-11-01T12:00:00Z" },
          { starred_at: "2026-11-10T08:00:00Z" },
        ],
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test("fetchTraffic, sync, and fetchStarHistory work end-to-end with mocked GitHub API", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-npm-sync-"));
  try {
    const fetchImpl = makeMockFetch();
    const summary = await fetchTraffic({
      token: "ghp_test",
      repoName: "octocat/demo",
      returnFormat: "summary",
      fetchImpl,
    });
    assert.equal(summary.repositories[0].views, 120);
    assert.equal(summary.repositories[0].clones, 30);

    const synced = await sync({
      token: "ghp_test",
      repoName: "octocat/demo",
      dataDir: dir,
      fetchImpl,
    });
    assert.equal(synced.syncedRecords, 1);
    assert.equal(synced.files.length, 1);

    const stars = await fetchStarHistory("octocat", "demo", { token: "ghp_test", fetchImpl });
    assert.deepEqual(stars, [
      { date: "2026-11-01", stars: 2 },
      { date: "2026-11-10", stars: 3 },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GitHub 401 and 403 rate-limit raise typed exceptions", async () => {
  await assert.rejects(
    () => fetchTraffic({ token: "", repoName: "octocat/demo" }),
    TokenExpiredError,
  );
  const rateLimitFetch = async () => ({
    ok: false,
    status: 403,
    headers: new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1799999999" }),
  });
  await assert.rejects(
    () => fetchTraffic({ token: "ghp_test", repoName: "octocat/demo", fetchImpl: rateLimitFetch }),
    GitHubRateLimitError,
  );
});

test("buildWidgetEmbed generates hosted api.gitlytics.dev URLs and Markdown", () => {
  const card = buildWidgetEmbed({ kind: "card", username: "ameyachopade", cardType: "profile-card", theme: "tokyonight", variant: "clay" });
  assert.ok(card.url.startsWith("https://api.gitlytics.dev/api/cards/profile-card/ameyachopade.svg?"));
  assert.ok(card.markdown.includes(card.url));
});
