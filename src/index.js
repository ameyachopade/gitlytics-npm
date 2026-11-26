import { exportVaultToJson, mergeAndWriteVault, queryCsvVault } from "./csv-vault.js";
import { fetchStarHistory, fetchTraffic } from "./github.js";
import { analyzeLocalRepo } from "./local-git.js";
import { serveDashboard } from "./dashboard/server.js";
import { buildWidgetEmbed } from "./widgets.js";
import { VERSION } from "./version.js";

export {
  GitHubAPIError,
  GitHubRateLimitError,
  GitlyticsError,
  NoTrafficDataError,
  StargazersRestrictedError,
  StarHistoryFetchError,
  TokenExpiredError,
} from "./exceptions.js";

export {
  VERSION as version,
  analyzeLocalRepo,
  buildWidgetEmbed,
  exportVaultToJson,
  fetchStarHistory,
  fetchTraffic,
  queryCsvVault,
  serveDashboard,
};

export async function sync({
  token = process.env.GITLYTICS_TOKEN || process.env.GITHUB_TOKEN || "",
  repoName = null,
  dataDir = "./data",
  outputMode = "monthly",
  metrics = null,
  publicOnly = false,
  exportJson = null,
  exportPublicOnly = true,
  fetchImpl = fetch,
} = {}) {
  const { records, privateRepos } = await fetchTraffic({
    token,
    repoName,
    metrics,
    returnFormat: "timeseries",
    publicOnly,
    fetchImpl,
  });

  const written = mergeAndWriteVault(records, { dataDir, outputMode });
  let exported = null;
  if (exportJson) {
    exported = exportVaultToJson({
      dataDir,
      outputPath: exportJson,
      exportPublicOnly,
      privateRepos,
    });
  }

  return {
    syncedRecords: records.length,
    files: written.files,
    totalRows: written.totalRows,
    exported,
  };
}
