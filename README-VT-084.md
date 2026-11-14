# VT-084: retry without duplicate writes

Branch: `individual/vt-084-retry` (based on `2a1e39fdc4ba120c35d51efe1412850481500370`).

## Run

Use Node.js 22.13 or newer, then run from the repository root:

```sh
npm ci
npm run typecheck
npm run test:e2e -w client -- retry.spec.ts
npm run test:retry-load
```

The E2E suite covers a pre-commit HTTP 500, a response lost after commit, and a timed-out request. The VT-084 case asserts both attempts use the same `Idempotency-Key` and the server retains one record. The load harness runs 150 concurrent PUT tasks against an in-memory server and fails when p95 exceeds 4 seconds. It measures a local single-user setup, not a real network or 150 independent accounts.

The expected review point is `client/e2e/retry.spec.ts`; no server or sync implementation change is included because the repository already implements retry and idempotency for this request.
