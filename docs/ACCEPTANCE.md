# Acceptance evidence

## Boundary

The public package boundary is the built `dist/index.js` entry point that npm
will expose to consumers. Tests construct standard Fetch `Request` objects,
sign raw bytes independently with Node's HMAC implementation, then use only
the compiled public exports.

## Required scenarios

| Requirement | Test | Oracle |
|---|---|---|
| Valid deliveries can be authenticated and processed once | `public-api.acceptance.test.ts` | Business-action counter is exactly one after a duplicate delivery |
| Invalid signatures do not reach business handling | `public-api.acceptance.test.ts` | Typed `invalid_signature` result before parsing |

Run with:

```bash
npm run test:acceptance
```

The scenarios use process-local stores intentionally. They prove the package
contract in a single process; they do not prove a production Redis/database
adapter, which this release does not ship.

## Recorded local evidence

Executed from `/home/nghung/Project/webhook-shield` on Node.js 22.23.1:

```bash
npm ci
npm run check
npm test
npm run test:acceptance
npm audit --omit=dev
npm pack --dry-run
git diff --check
```

All commands exited with status `0`. The unit/integration suite passed 20
tests across five files; the compiled-package acceptance suite passed two
tests. The dry-run tarball contained only runtime artifacts and public
documentation listed by `package.json`.
