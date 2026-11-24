# Security Policy - `@gitlytics/cli`

This package is part of the **Gitlytics Ecosystem**. Security issues in any Gitlytics repository or package follow the same private disclosure process.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.9.x` (latest) | Yes |
| `< 0.9.0` | No |

## Security Controls in `@gitlytics/cli`

- **Loopback Default & Non-Loopback Gate**: `gitlytics dashboard` binds to `127.0.0.1` by default and refuses non-loopback hosts unless `--public-bind` is explicitly passed.
- **Env-Var-Only MCP Tokens**: `gitlytics mcp --mode local` never accepts raw GitHub tokens in tool schemas (preventing secrets in AI chat logs); live GitHub calls read `GITLYTICS_TOKEN` / `GITHUB_TOKEN` strictly from `process.env`.
- **Path Containment & Formula Escaping**: CSV vault queries enforce strict path containment under `--data-dir` (blocking `..` traversal), CSV writes escape leading formula characters (`=`, `+`, `-`, `@`), and JSON exports strip private repositories by default (`exportPublicOnly: true`).
- **Zero Third-Party Dependencies**: Reduces supply-chain attack surface to Node.js built-ins only.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities privately using either:
1. GitHub's **Private Vulnerability Reporting** (**Security** tab -> **Advisories** -> **Report a vulnerability**).
2. Email **contact@gitlytics.dev** (or **ameyasanjaychopade@gmail.com**) with `[SECURITY]` in the subject line.

Please include:
- **Affected Component** (CLI, JS/TS SDK, MCP bridge/local server, or local dashboard)
- **Impact & Detailed Description**
- **Steps to Reproduce** or minimal Proof of Concept

## Response SLA

1. **Acknowledgment**: Within 72 hours.
2. **Triage & Investigation**: Severity assessment and root-cause analysis.
3. **Fix & Advisory**: Coordinated patch release and credit (if desired).
