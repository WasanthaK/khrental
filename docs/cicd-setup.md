# CI and production release

The maintained application workflow is `.github/workflows/deploy-container-apps.yml`. Do not create a parallel deployment workflow or use the old App Service publish-profile example.

## Verification

Pull requests run `npm ci`, syntax checks, strict `npm run lint`, `npm test` (also exposed as `npm run test:authorization`) and the production build. The test runner recursively discovers `tests/**/*.test.{js,mjs,cjs}`; it does not execute operator scripts under `scripts/`. Relevant changes also require the disposable SQL Server, browser and Evia contract workflows. Browser cases require the Chrome supplied by Puppeteer in CI.

`npm run lint` uses `eslint.config.js` and explicit development dependencies, rejects unused suppression comments and allows zero warnings. PR #559 cleared the existing debt; lint is now a mandatory deployment verification step before tests/build. React dependency checks remain enabled. Narrow control-character regex exceptions preserve input validation, and underscore-prefixed unused parameters retain compatibility signatures and Express error-handler arity. Do not weaken rules or blanket-ignore source to manufacture a green result. See the [security disposition](SECURITY-REVIEW-20261111.md) for the evidence.

## Production release

A push verifies source; it does not deploy it. After the reviewed commit and required checks are on `main`, explicitly run **Build and deploy KH Rentals container** using **Run workflow → main**. The production job requires `workflow_dispatch`, `refs/heads/main` and the `Production` environment. The marketing deployment, webhook configuration, membership backfill and historical R3 operator jobs are also manual and main-only. Production operations are serialized without cancellation; superseded PR verification can still cancel.

Every external action is pinned to an upstream commit SHA. Azure OIDC is granted only to the jobs using Azure login; verification has no identity-token or package-write grant. The deployment job alone can publish the GHCR image. Retain the version comment when reviewing future SHA updates.

Configure required reviewers and a `main`-only deployment branch rule in the repository's **Production environment**. Source guards are implemented; the connected API cannot inspect or configure these environment settings, so their existence is unverified. Do not claim an environment approval was obtained from a passing source test.

Release acceptance must record the immutable serving build SHA, Ready revision, bounded independent `/build-info.json` and trimmed `/api/mssql/health` results. A merged PR is not runtime evidence. Do not repeatedly sign accepted agreements or activate management enforcement/live charging as part of security acceptance.

## Server configuration

Use the existing Production OIDC federation and environment secrets described in [free-cloud deployment](free-cloud-deployment.md). SendGrid, Evia bearer tokens/client secrets, R2 credentials and HMAC keys stay server-side. Never add them to a `VITE_` variable or build argument.

Production sign-in/sign-up throttling requires the existing shared `dbo.public_signup_rate_limits` table and a server-only `AUTH_THROTTLE_SECRET` of at least 32 bytes; the already-configured `PUBLIC_SIGNUP_THROTTLE_SECRET` is an accepted fallback. An unavailable table, key or quota store denies credential attempts with 503. No process-local production fallback is allowed. The Azure trusted-ingress contract must be proved before configuring `PUBLIC_SIGNUP_INGRESS_MODE=azure-container-apps-http`; otherwise the socket address is authoritative. Do not trust arbitrary forwarding headers.

No schema apply is part of a normal application release. Existing migration plan/apply authority, explicit confirmation and checksum checks remain separate.

Historical domain/DNS, production audit/diagnostic and production migration plan/apply workflows are also manual-only. This prevents edits to pinned actions from replaying old operator tasks or waiting for an undeployed source SHA. Production migration apply retains its separate explicit confirmation and privileged executor checks; disposable migration CI remains automatic.

Reusable migration-preflight caller jobs also declare their own job-level `id-token: write`. GitHub cannot elevate permissions inside a called workflow; retaining that exact caller grant avoids breaking manual release preflights. See [GitHub reusable-workflow permissions](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
