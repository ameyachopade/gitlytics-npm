# Security Policy - `@gitlytics/cli`

This package is part of the **Gitlytics Ecosystem**.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.9.x` (latest) | Yes |
| `< 0.9.0` | No |

## Security Controls

- **Loopback Default**: `gitlytics dashboard` binds strictly to `127.0.0.1` unless `--public-bind` is passed.
- **Env-Var-Only MCP Tokens**: `gitlytics mcp --mode local` never accepts raw GitHub tokens in tool schemas and reads `GITLYTICS_TOKEN` / `GITHUB_TOKEN` strictly from `process.env`.
- **Path Containment & Formula Escaping**: CSV vault queries block path traversal (`..`) outside `--data-dir`, and CSV writes escape leading formula characters (`=`, `+`, `-`, `@`).

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **contact@gitlytics.dev** (or **ameyasanjaychopade@gmail.com**) with `[SECURITY]` in the subject line. We aim to acknowledge reports within 72 hours.
