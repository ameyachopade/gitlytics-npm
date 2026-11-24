/**
 * Typed error hierarchy matching the Python `gitlytics` SDK exceptions.
 */

export class GitlyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = "GitlyticsError";
  }
}

export class GitHubAPIError extends GitlyticsError {
  constructor(message, statusCode = null) {
    super(message);
    this.name = "GitHubAPIError";
    this.statusCode = statusCode;
  }
}

export class GitHubRateLimitError extends GitHubAPIError {
  constructor(message = "GitHub API rate limit exceeded.", resetAt = null) {
    super(message, 403);
    this.name = "GitHubRateLimitError";
    this.resetAt = resetAt;
  }
}

export class TokenExpiredError extends GitHubAPIError {
  constructor(message = "GitHub token is invalid, expired, or lacks required permissions.") {
    super(message, 401);
    this.name = "TokenExpiredError";
  }
}

export class NoTrafficDataError extends GitlyticsError {
  constructor(message = "No traffic data available for the requested repository.") {
    super(message);
    this.name = "NoTrafficDataError";
  }
}

export class StarHistoryFetchError extends GitHubAPIError {
  constructor(message, statusCode = null) {
    super(message, statusCode);
    this.name = "StarHistoryFetchError";
  }
}

export class StargazersRestrictedError extends StarHistoryFetchError {
  constructor(message = "GitHub restricted stargazers access for this repository.") {
    super(message, 403);
    this.name = "StargazersRestrictedError";
  }
}
