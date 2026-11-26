import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeLocalRepo } from "../src/local-git.js";

test("analyzeLocalRepo computes commit velocity, bus factor, and churn hotspots", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-local-git-"));
  const repoDir = path.join(tmp, "sample-repo");
  fs.mkdirSync(repoDir);
  try {
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "config", "user.name", "Alice"], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "config", "user.email", "alice@example.com"], { stdio: "ignore" });
    fs.writeFileSync(path.join(repoDir, "index.js"), "export const v = 1;\n");
    execFileSync("git", ["-C", repoDir, "add", "index.js"], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "commit", "-m", "initial"], { stdio: "ignore" });
    fs.writeFileSync(path.join(repoDir, "index.js"), "export const v = 2;\n");
    execFileSync("git", ["-C", repoDir, "add", "index.js"], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "commit", "-m", "bump"], { stdio: "ignore" });

    const report = analyzeLocalRepo({ repoPath: repoDir, days: 30 });
    assert.equal(report.repo_name, "sample-repo");
    assert.equal(report.total_commits, 2);
    assert.equal(report.active_authors, 1);
    assert.equal(report.bus_factor, 1);
    assert.equal(report.hotspots[0].file, "index.js");
    assert.equal(report.hotspots[0].touches, 2);
    assert.match(report.agent_prompt, /index\.js/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("analyzeLocalRepo rejects git option injection and traversal outside allowedRoot", () => {
  assert.throws(() => analyzeLocalRepo({ repoPath: "--upload-pack=bad" }), /must not start with '-'/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-root-"));
  try {
    assert.throws(() => analyzeLocalRepo({ repoPath: "..", allowedRoot: tmp }), /outside the allowed/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
