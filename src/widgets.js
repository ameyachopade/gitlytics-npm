import { API_BASE } from "./version.js";
import { validateOwnerRepo } from "./validation.js";

/**
 * Build hosted Gitlytics SVG URLs, Markdown, and HTML snippets for READMEs.
 */
export function buildWidgetEmbed(options = {}) {
  const {
    kind = "card",
    username = "",
    cardType = "profile-details",
    owner = "",
    repo = "",
    metric = "views",
    packageName = "",
    slug = "",
    label = "",
    message = "",
    value = "",
    theme = "",
    variant = "",
    shape = "",
    style = "",
    color = "",
    alt = "",
  } = options;

  const qs = new URLSearchParams();
  if (theme) qs.set("theme", theme);
  if (variant) qs.set("variant", variant);
  if (shape) qs.set("shape", shape);
  if (color) qs.set("color", color);

  let urlPath = "";
  let defaultAlt = "Gitlytics Widget";

  if (kind === "card") {
    if (!username) throw new Error("username is required for kind='card'");
    urlPath = `/api/cards/${encodeURIComponent(cardType)}/${encodeURIComponent(username)}.svg`;
    defaultAlt = `${username} ${cardType}`;
  } else if (kind === "tech_badge") {
    if (!slug) throw new Error("slug is required for kind='tech_badge'");
    qs.set("slug", slug);
    if (style) qs.set("style", style);
    if (label) qs.set("label", label);
    if (value) qs.set("value", value);
    urlPath = "/api/badge/tech.svg";
    defaultAlt = label || slug;
  } else if (kind === "static_badge") {
    if (!label || !message) throw new Error("label and message are required for kind='static_badge'");
    qs.set("label", label);
    qs.set("message", message);
    urlPath = "/api/badge/static.svg";
    defaultAlt = `${label}: ${message}`;
  } else if (kind === "live_badge") {
    const [cleanOwner, cleanRepo] = validateOwnerRepo(owner, repo);
    urlPath = `/api/badge/${cleanOwner}/${cleanRepo}/${encodeURIComponent(metric)}.svg`;
    defaultAlt = `${cleanOwner}/${cleanRepo} ${metric}`;
  } else if (kind === "pypi_badge") {
    if (!packageName) throw new Error("packageName is required for kind='pypi_badge'");
    urlPath = `/api/badge/pypi/${encodeURIComponent(packageName)}.svg`;
    defaultAlt = `PyPI ${packageName}`;
  } else if (kind === "chart") {
    const [cleanOwner, cleanRepo] = validateOwnerRepo(owner, repo);
    urlPath = `/api/chart/${cleanOwner}/${cleanRepo}/${encodeURIComponent(metric)}.svg`;
    defaultAlt = `${cleanOwner}/${cleanRepo} ${metric} chart`;
  } else {
    throw new Error(`Unsupported widget kind: ${kind}`);
  }

  const query = qs.toString();
  const url = `${API_BASE}${urlPath}${query ? `?${query}` : ""}`;
  const safeAlt = alt || defaultAlt;

  return {
    kind,
    url,
    markdown: `![${safeAlt}](${url})`,
    html: `<img src="${url}" alt="${safeAlt}" />`,
  };
}
