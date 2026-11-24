<div align="center">

<img src="https://raw.githubusercontent.com/ameyachopade/gitlytics/main/assets/logo.png" alt="Gitlytics Logo" width="140" />

# `@gitlytics/cli`

### Zero-Dependency GitHub Traffic Analytics CLI, JS/TS SDK, Dual-Mode MCP Server & Local Dashboard

[![npm version](https://api.gitlytics.dev/api/badge/npm/@gitlytics/cli.svg?label=npm&color=cb3837&theme=gitlytics-dark&variant=clay)](https://www.npmjs.com/package/@gitlytics/cli)
[![Node](https://api.gitlytics.dev/api/badge/tech.svg?slug=nodedotjs&style=icon_label_value&label=Node&value=18%2B&theme=gitlytics-dark&variant=clay)](https://nodejs.org/)
[![License](https://api.gitlytics.dev/api/badge/static.svg?label=License&message=Apache%202.0%20%2B%20Commons%20Clause&color=3b82f6&theme=gitlytics-dark&variant=clay)](LICENSE)
[![Live Dashboard](https://api.gitlytics.dev/api/badge/static.svg?label=Studio&message=dashboard.gitlytics.dev&color=818cf8&theme=gitlytics-dark&variant=clay)](https://dashboard.gitlytics.dev)
[![Documentation](https://api.gitlytics.dev/api/badge/static.svg?label=Docs&message=docs.gitlytics.dev&color=10b981&theme=gitlytics-dark&variant=clay)](https://docs.gitlytics.dev)
[![Agent Skills](https://api.gitlytics.dev/api/badge/tech.svg?slug=vercel&style=icon_label_value&label=skills.sh&value=4%20Agent%20Skills&theme=gitlytics-dark&variant=clay)](https://skills.sh/ameyachopade/gitlytics-plugin)

<br/>

The JavaScript/TypeScript companion to PyPI [`gitlytics`](https://pypi.org/project/gitlytics/) - 100% CSV-vault compatible, zero runtime dependencies.

[![PyPI](https://api.gitlytics.dev/api/badge/pypi/gitlytics.svg?label=PyPI&theme=gitlytics-dark&variant=clay)](https://pypi.org/project/gitlytics/)
[![MCP](https://api.gitlytics.dev/api/badge/static.svg?label=MCP&message=OAuth%202.1%20%2B%20Stdio&theme=gitlytics-dark&variant=clay)](https://docs.gitlytics.dev/mcp)
[![Blog](https://api.gitlytics.dev/api/badge/static.svg?label=Blog&message=blog.gitlytics.dev&color=f59e0b&theme=gitlytics-dark&variant=clay)](https://blog.gitlytics.dev)

</div>

---

## Installation

```bash
# Global CLI install
npm install -g @gitlytics/cli

# Project SDK install (ESM + TypeScript types)
npm install @gitlytics/cli
```

## Quick Start

```bash
# Or run directly without installing via npx
npx @gitlytics/cli fetch --repo-name owner/repo --print-table

# Sync into monthly 22-column CSV vaults (interchangeable with Python gitlytics)
npx @gitlytics/cli sync --data-dir ./data --output-mode monthly

# Inspect star history
npx @gitlytics/cli stars owner/repo --json

# Launch local loopback dashboard
npx @gitlytics/cli dashboard --data-dir ./data --port 8000
```

## Dual-Mode MCP Server

```bash
# Cloud MCP bridge (for stdio-only clients -> https://api.gitlytics.dev/mcp)
npx -y @gitlytics/cli mcp --mode cloud

# Local offline CSV vault MCP server (5 local tools, env-var token only)
npx -y @gitlytics/cli mcp --mode local --data-dir ./data
```

## JavaScript / TypeScript SDK

```ts
import { fetchTraffic, sync, fetchStarHistory, queryCsvVault, buildWidgetEmbed } from "@gitlytics/cli";

const result = await sync({ dataDir: "./data", outputMode: "monthly" });
const vault = queryCsvVault({ dataDir: "./data", days: 90 });
const badge = buildWidgetEmbed({ kind: "tech_badge", slug: "typescript", style: "icon_label" });
```

---

## The Gitlytics Ecosystem

| Project | Role | Link |
| :--- | :--- | :--- |
| **[gitlytics](https://github.com/ameyachopade/gitlytics)** | Core Python library, CLI (`fetch`, `sync`, `stars`, `dashboard`, `mcp`), and local dashboard | [PyPI](https://pypi.org/project/gitlytics/) |
| **[gitlytics-npm](https://github.com/ameyachopade/gitlytics-npm)** *(this package)* | Zero-dependency Node.js CLI, JS/TS SDK, dual-mode MCP & local dashboard | [npm (`@gitlytics/cli`)](https://www.npmjs.com/package/@gitlytics/cli) |
| **[gitlytics-plugin](https://github.com/ameyachopade/gitlytics-plugin)** | Official Antigravity plugin, MCP configs & 4 Vercel Agent Skills | [skills.sh](https://skills.sh/ameyachopade/gitlytics-plugin) |
| **[gitlytics-github-traffic-automation](https://github.com/ameyachopade/gitlytics-github-traffic-automation)** | Composite GitHub Action for automated CSV traffic backups | [GitHub Action](https://github.com/ameyachopade/gitlytics-github-traffic-automation) |
| **Gitlytics Web & Docs** | Official Homepage, Docs Hub & Engineering Blog | [gitlytics.dev](https://gitlytics.dev) / [docs.gitlytics.dev](https://docs.gitlytics.dev) / [blog.gitlytics.dev](https://blog.gitlytics.dev) |
| **Gitlytics Cloud Dashboard** | Hosted Analytics Dashboard, Embed Studio & MCP OAuth Consent UI | [dashboard.gitlytics.dev](https://dashboard.gitlytics.dev) |
| **Gitlytics Hosted API & MCP** | 50-card / 200-logo SVG engine & Streamable HTTP MCP server (`/mcp-oauth` & `/mcp`) | [api.gitlytics.dev](https://api.gitlytics.dev) |

---

## Contributing, Security & License

- **Contributing**: See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Security**: See [`SECURITY.md`](SECURITY.md).
- **License**: Licensed under the **Apache License 2.0 + Commons Clause v1.0**. See [`LICENSE`](LICENSE) for full details.
