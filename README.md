# webhook-shield

A small, framework-agnostic TypeScript library for verifying timestamped HMAC-SHA256 webhook signatures safely.

> Status: **early development**. The public API in `0.x` may change before `1.0`.

## Why

Signature verification often fails in subtle and unsafe ways: parsing JSON before verification, using ordinary string comparison, accepting old deliveries, or retrying duplicate events. `webhook-shield` focuses on the first boundary: authenticating an unmodified request body with a bounded timestamp window.

## Install

```bash
npm install webhook-shield
```

## Use

Pass the **raw bytes** from the HTTP request before parsing its JSON body.

```ts
import { verifyWebhookSignature } from "webhook-shield";

const result = verifyWebhookSignature({
  secret: process.env.WEBHOOK_SECRET!,
  payload: rawRequestBody,
  signature: request.headers.get("x-webhook-signature") ?? "",
  timestamp: request.headers.get("x-webhook-timestamp") ?? "",
  toleranceSeconds: 300,
});

if (!result.ok) {
  return new Response("Invalid webhook", { status: 401 });
}

// Only now is it safe to parse the payload.
const event = JSON.parse(new TextDecoder().decode(rawRequestBody));
```

`signature` accepts `v1=<hex>` or a comma-separated list such as `v1=<old>, v1=<new>`, which lets providers rotate signing keys.

## Security guarantees and limits

- HMAC-SHA256 candidate signatures are compared using Node's constant-time comparison.
- The signed input is exactly `${timestamp}.${rawPayload}`.
- Deliveries outside the configured clock-skew window are rejected; the default is five minutes.
- Malformed untrusted headers return a typed failure instead of throwing.
- The library makes no network calls and does not collect telemetry.

Webhook authentication alone does **not** prevent a valid delivery being processed twice inside the valid timestamp window. Application code must enforce idempotency using a provider event ID and durable, atomic storage.

## Replay protection

Use the provider's stable delivery/event ID as a namespaced replay key. The
production adapter must perform the operation atomically. `InMemoryReplayStore`
is only for tests and one-process development; it loses all state on restart.

```ts
import { InMemoryReplayStore } from "webhook-shield";

const replayStore = new InMemoryReplayStore();
const replay = await replayStore.consume({
  key: `stripe:${event.id}`,
  expiresAt: new Date(Date.now() + 5 * 60_000),
});

if (replay.status !== "accepted") {
  return new Response("Duplicate or expired webhook", { status: 409 });
}
```

## Idempotent event handling

Use a separate idempotency store around the business side effect. A lease token
prevents a stale worker from marking work completed after another worker has
reclaimed it. The included in-memory adapter is intentionally development-only.

```ts
import { InMemoryIdempotencyStore } from "webhook-shield";

const idempotency = new InMemoryIdempotencyStore();
const claim = await idempotency.claim({
  key: `stripe:${event.id}`,
  leaseExpiresAt: new Date(Date.now() + 30_000),
});

if (claim.status !== "claimed") {
  return new Response("Already processing or completed", { status: 200 });
}

await applyBusinessSideEffect(event);
await idempotency.complete({ key: `stripe:${event.id}`, token: claim.token });
```

This coordinates a single claim; it does not make arbitrary external side
effects exactly-once. A production store must be durable, atomic, and retain
completed keys for an application-chosen bounded period.

## Compatibility

Node.js 20 or later. This package intentionally uses Node's audited built-in `crypto` module and has no runtime dependencies.

## Development

```bash
npm install
npm test
npm run check
npm run build
```

## Reporting vulnerabilities

Please follow [SECURITY.md](./SECURITY.md). Do not open public issues for suspected security vulnerabilities.
