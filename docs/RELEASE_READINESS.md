# AgentPrime Release Readiness

Use this checklist before publishing installers or tagging a release.

## Local Data Policy

- `data/project-registry.json` is local user state and should not be committed.
- `PrimeProjects/` is a local playground/generated-project area and should not be treated as product source.
- Secrets belong in secure settings, keychain-backed storage, environment variables, or local-only files ignored by git.

## Verification Gate

Run the full local gate before tagging:

```bash
npm ci
npm run verify
npm run test:e2e
```

For release builds with the optional Python Brain included, use the strict preflight path:

```bash
npm run preflight:dist -- --build-backend
npm run dist:<platform>
```

CI uses `preflight:dist:ci` as a smoke gate and can skip a missing `backend/dist` artifact. A green CI preflight does not by itself prove the backend binary is packaged.

## Dependency Hygiene

- Dependabot is enabled for npm and GitHub Actions.
- Treat dependency updates as normal maintenance PRs.
- Run an explicit audit before public release and document any accepted findings.

## Documentation Truth

- Keep `package.json` version, release notes, README status, and installer artifacts aligned.
- Coverage thresholds are baseline guardrails unless raised in `jest.config.js`; do not describe them as an 80 percent gate unless the config enforces that.
