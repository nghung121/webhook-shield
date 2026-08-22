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

Webhook authentication alone does **not** prevent a valid delivery being processed twice inside the valid timestamp window. Application code must enforce idempotency using a provider event ID and durable, atomic storage. Replay-store adapters will be introduced only when their atomicity and failure semantics are explicit.

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
