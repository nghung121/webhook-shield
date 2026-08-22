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
