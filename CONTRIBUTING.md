# Contributing to `@gitlytics/cli`

Thank you for contributing to the **Gitlytics Ecosystem**. This package provides the zero-dependency Node.js CLI (`fetch`, `sync`, `stars`, `mcp`, `dashboard`), JavaScript/TypeScript SDK, and dual-mode MCP server (`@gitlytics/cli`).

## Getting Started

1. Clone the repository and verify Node.js 18+:
   ```bash
   node -v
   ```
2. Run the offline test suite (zero dependencies to install):
   ```bash
   npm test
   node ./bin/gitlytics.js --version
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feat/your-change
   ```

## Standards & Guardrails

- **Zero Runtime Dependencies**: Use Node 18+ built-in APIs (`fetch`, `node:fs`, `node:http`, `node:readline`, `node:util`) only.
- **CSV Vault Parity**: Maintain exact 22-column monthly/yearly CSV compatibility with PyPI `gitlytics`.
- **TypeScript Declarations**: Keep `types/index.d.ts` synchronized with `src/index.js`.
- **Zero Secrets**: Never commit `.env` files, GitHub PATs, `glt_live_...` API keys, or private traffic CSVs.
- **Security Issues**: Follow [SECURITY.md](SECURITY.md) and report vulnerabilities privately.

## Pull Request Checklist

- [ ] `npm test` passes with 0 failures
- [ ] `types/index.d.ts` matches any new or changed exports
- [ ] No secrets or temporary files are staged

## The Gitlytics Ecosystem

| Project | Role | Link |
| :--- | :--- | :--- |
| [gitlytics](https://github.com/ameyachopade/gitlytics) | Core Python library, CLI, local stdio MCP & local dashboard | [PyPI](https://pypi.org/project/gitlytics) |
| **[gitlytics-npm](https://github.com/ameyachopade/gitlytics-npm)** *(this package)* | Zero-dependency Node.js CLI, JS/TS SDK, dual-mode MCP & local dashboard | [npm (`@gitlytics/cli`)](https://www.npmjs.com/package/@gitlytics/cli) |
| [gitlytics-plugin](https://github.com/ameyachopade/gitlytics-plugin) | Official Antigravity plugin, MCP config & 4 `npx skills` | [skills.sh](https://skills.sh/ameyachopade/gitlytics-plugin) |
| [gitlytics-github-traffic-automation](https://github.com/ameyachopade/gitlytics-github-traffic-automation) | Composite GitHub Action for automated CSV backups | [GitHub Action](https://github.com/ameyachopade/gitlytics-github-traffic-automation) |
| [gitlytics-metadata-pages](https://github.com/ameyachopade/gitlytics-metadata-pages) | Homepage, Docs Hub & Engineering Blog | [gitlytics.dev](https://gitlytics.dev) / [docs.gitlytics.dev](https://docs.gitlytics.dev) |
| Gitlytics Cloud Dashboard & API | Hosted Analytics Dashboard, SVG Engine & MCP Server | [dashboard.gitlytics.dev](https://dashboard.gitlytics.dev) / [api.gitlytics.dev](https://api.gitlytics.dev) |
