import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CSV_COLUMNS,
  exportVaultToJson,
  mergeAndWriteVault,
  parseCsvText,
  queryCsvVault,
} from "../src/csv-vault.js";

test("mergeAndWriteVault writes 22-column monthly CSVs, deduplicates, and queries cleanly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitlytics-npm-vault-"));
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r1 = mergeAndWriteVault(
      [
        { date: today, repository: "ameyachopade/gitlytics", views: 50, unique_visitors: 25, clones: 10, unique_cloners: 8, stars: 42 },
      ],
      { dataDir: dir, outputMode: "monthly" },
    );
    assert.equal(r1.files.length, 1);
    assert.equal(r1.totalRows, 1);

    // Deduplicate same (date, repository) with updated views
    mergeAndWriteVault(
      [
        { date: today, repository: "ameyachopade/gitlytics", views: 80, unique_visitors: 40, clones: 12, unique_cloners: 9, stars: 45 },
        { date: today, repository: "ameyachopade/private-repo", views: 5, unique_visitors: 2, clones: 1, unique_cloners: 1, stars: 1 },
      ],
      { dataDir: dir, outputMode: "monthly" },
    );

    const rawCsv = fs.readFileSync(r1.files[0], "utf8");
    assert.equal(rawCsv.split("\n")[0], CSV_COLUMNS.join(","));
    assert.equal(parseCsvText(rawCsv).length, 2);

    const vault = queryCsvVault({ dataDir: dir, repoName: "ameyachopade/gitlytics", days: 30 });
    assert.equal(vault.row_count, 1);
    assert.equal(vault.summary.total_views, 80);
    assert.equal(vault.summary.total_clones, 12);

    // Public-only JSON export strips private repos
    const jsonOut = path.join(dir, "export.json");
    const exp = exportVaultToJson({
      dataDir: dir,
      outputPath: jsonOut,
      exportPublicOnly: true,
      privateRepos: new Set(["ameyachopade/private-repo"]),
    });
    assert.equal(exp.rowCount, 1);
    const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
    assert.equal(parsed[0].repository, "ameyachopade/gitlytics");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
