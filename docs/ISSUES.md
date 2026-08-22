# webhook-shield v0.1 delivery backlog

These are GitHub-ready issues for the first public release. They are stored in
the repository because no GitHub remote is configured yet.

| Issue | Title | Depends on | Acceptance criteria | Status |
|---|---|---|---|---|
| #1 | Bootstrap a publishable TypeScript package | — | Builds on supported Node versions; package contains only public artifacts | Done |
| #2 | Verify timestamped HMAC-SHA256 signatures | #1 | Raw bytes are signed; comparison is constant-time; old, future, malformed and rotated signatures are handled | Done |
| #3 | Add bounded Fetch Request verification | #2 | Uses raw bytes; rejects over-size and missing required headers; returns a typed result | Done |
| #4 | Add replay-protection storage contract | #2 | Atomic consume contract and deterministic in-memory reference adapter; expiry semantics documented | Done |
| #5 | Add idempotency storage contract | #2 | Atomic claim/complete contract; deterministic in-memory adapter; no exactly-once claim | Done |
| #6 | Add security regression coverage | #2–#5 | Binary payload, malformed input, limits, replay, concurrency and public package smoke tests pass | Done |
| #7 | Prepare public release automation and docs | #1–#6 | CI, dependency updates, security policy, contribution/release guides and examples are present | Done |

## Issue #3 — Add bounded Fetch Request verification

Expose a Fetch-standard helper that reads a body once, enforces `maxPayloadBytes`,
extracts configured signature/timestamp headers, and delegates only the exact
raw bytes to the verifier. It must never parse JSON.

## Issue #4 — Add replay-protection storage contract

Expose a provider-neutral `ReplayStore` whose `consume` operation is atomic:
it returns `true` exactly once for a replay key before the supplied expiry.
Ship a process-local adapter for tests and single-instance development only.
Document that production needs a durable atomic backend such as Redis or a
database transaction.

## Issue #5 — Add idempotency storage contract

Expose an atomic `IdempotencyStore` with explicit `claimed`, `in_progress`,
and `completed` outcomes. Do not promise exactly-once delivery; callers must
make their business side effects idempotent.

## Issue #6 — Add security regression coverage

Extend behavioral tests at the public API boundary. Use controlled time and
deterministic inputs; test body-size limits, binary payloads, malformed
headers, expiration, concurrent claims and package imports.

## Issue #7 — Prepare public release automation and docs

Run test/type/build/package checks in CI on all supported Node versions;
configure dependency updates; document security reporting, contribution rules,
release provenance, limitations, and a framework-neutral quick start.
