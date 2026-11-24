# Contributing to `@gitlytics/cli`

Thank you for contributing to the **Gitlytics Ecosystem**.

## Local Verification

Requires Node.js 18+ with zero external dependencies:

```bash
npm test
node ./bin/gitlytics.js --version
```

## Standards & Guardrails

- Keep runtime dependencies at **zero** (Node built-ins only).
- Maintain exact 22-column CSV vault compatibility with Python `gitlytics`.
- Keep `types/index.d.ts` synchronized with `src/index.js`.
- Never commit tokens, `.env` files, or private traffic CSVs.
- Report security issues privately per [SECURITY.md](SECURITY.md).
