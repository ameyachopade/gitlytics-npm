export const version: string;

export class GitlyticsError extends Error {}
export class GitHubAPIError extends GitlyticsError {
  statusCode: number | null;
}
export class GitHubRateLimitError extends GitHubAPIError {
  resetAt: number | null;
}
export class TokenExpiredError extends GitHubAPIError {}
export class NoTrafficDataError extends GitlyticsError {}
export class StarHistoryFetchError extends GitHubAPIError {}
export class StargazersRestrictedError extends StarHistoryFetchError {}

export interface TrafficRecord {
  date: string;
  repository: string;
  views: number;
  unique_visitors: number;
  clones: number;
  unique_cloners: number;
  stars: number;
  forks: number;
  releases: number;
  language: string;
  topics: string;
  watchers_count: number;
  created_at: string;
  open_issues_count: number;
  top_referrer: string;
  top_referrer_views: number;
  top_referrer_uniques: number;
  _raw_referrers: string;
  top_path: string;
  top_path_views: number;
  top_path_uniques: number;
  _raw_paths: string;
}

export interface RepoTrafficSummary {
  repository: string;
  views: number;
  unique_visitors: number;
  clones: number;
  unique_cloners: number;
  stars: number;
  forks: number;
  days: number;
}

export interface FetchTrafficOptions {
  token?: string;
  repoName?: string | string[] | null;
  metrics?: string[] | null;
  returnFormat?: "timeseries" | "summary";
  publicOnly?: boolean;
  fetchImpl?: typeof fetch;
}

export interface SyncOptions {
  token?: string;
  repoName?: string | string[] | null;
  dataDir?: string;
  outputMode?: "monthly" | "yearly";
  metrics?: string[] | null;
  publicOnly?: boolean;
  exportJson?: string | null;
  exportPublicOnly?: boolean;
  fetchImpl?: typeof fetch;
}

export interface SyncResult {
  syncedRecords: number;
  files: string[];
  totalRows: number;
  exported: { path: string; rowCount: number } | null;
}

export interface StarPoint {
  date: string;
  stars: number;
}

export interface QueryCsvVaultOptions {
  dataDir?: string;
  repoName?: string | null;
  days?: number;
}

export interface CsvVaultResult {
  data_dir: string;
  files_scanned: number;
  row_count: number;
  repositories: string[];
  summary: {
    total_views: number;
    total_unique_visitors: number;
    total_clones: number;
    total_unique_cloners: number;
    clone_to_visitor_ratio: number;
  };
  rows: TrafficRecord[];
}

export interface WidgetEmbedOptions {
  kind: "card" | "tech_badge" | "static_badge" | "live_badge" | "pypi_badge" | "chart";
  username?: string;
  cardType?: string;
  owner?: string;
  repo?: string;
  metric?: "views" | "clones" | "stars";
  packageName?: string;
  slug?: string;
  label?: string;
  message?: string;
  value?: string;
  theme?: string;
  variant?: string;
  shape?: string;
  style?: "icon" | "icon_label" | "icon_label_value";
  color?: string;
  alt?: string;
}

export interface WidgetEmbedResult {
  kind: string;
  url: string;
  markdown: string;
  html: string;
}

export interface DashboardOptions {
  dataDir?: string;
  host?: string;
  port?: number;
  publicBind?: boolean;
}

export function fetchTraffic(
  options?: FetchTrafficOptions,
): Promise<{ records?: TrafficRecord[]; repositories?: RepoTrafficSummary[]; privateRepos: Set<string> }>;

export function sync(options?: SyncOptions): Promise<SyncResult>;

export function fetchStarHistory(
  owner: string,
  repo: string,
  options?: { token?: string; maxPages?: number; fetchImpl?: typeof fetch },
): Promise<StarPoint[]>;

export function queryCsvVault(options?: QueryCsvVaultOptions): CsvVaultResult;

export function exportVaultToJson(options: {
  dataDir?: string;
  outputPath: string;
  exportPublicOnly?: boolean;
  privateRepos?: Set<string>;
}): { path: string; rowCount: number };

export function buildWidgetEmbed(options: WidgetEmbedOptions): WidgetEmbedResult;

export function serveDashboard(
  options?: DashboardOptions,
): Promise<{ server: import("node:http").Server; host: string; port: number }>;
