import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InMemoryIdempotencyStore,
  InMemoryReplayStore,
  verifyFetchWebhook,
} from "../dist/index.js";

const secret = "whsec_acceptance-secret";
const timestamp = 1_700_000_000;

function signedRequest(eventId: string, signatureOverride?: string): Request {
  const payload = new TextEncoder().encode(JSON.stringify({ id: eventId, type: "invoice.paid" }));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(payload)
    .digest("hex");

  return new Request("https://example.test/webhooks/provider", {
    method: "POST",
    headers: {
      "x-webhook-signature": signatureOverride ?? `v1=${signature}`,
      "x-webhook-timestamp": String(timestamp),
    },
    body: payload,
  });
}

describe("published-package webhook boundary", () => {
  it("authenticates a delivery and performs the business action once across a duplicate", async () => {
    const replay = new InMemoryReplayStore({ now: () => timestamp * 1_000 });
    const idempotency = new InMemoryIdempotencyStore({ now: () => timestamp * 1_000 });
    let businessActions = 0;

    for (const request of [signedRequest("evt_123"), signedRequest("evt_123")]) {
      const verified = await verifyFetchWebhook(request, { secret, now: () => timestamp * 1_000 });
      expect(verified.ok).toBe(true);
      if (!verified.ok) continue;

      const event = JSON.parse(new TextDecoder().decode(verified.payload)) as { id: string };
      const replayResult = await replay.consume({
        key: `provider:${event.id}`,
        expiresAt: new Date((timestamp + 300) * 1_000),
      });
      if (replayResult.status !== "accepted") continue;

      const claim = await idempotency.claim({
        key: `provider:${event.id}`,
        leaseExpiresAt: new Date((timestamp + 30) * 1_000),
      });
      if (claim.status !== "claimed") continue;
      businessActions += 1;
      await idempotency.complete({ key: `provider:${event.id}`, token: claim.token });
    }

    expect(businessActions).toBe(1);
  });

  it("rejects an attacker-controlled signature before event parsing or side effects", async () => {
    const result = await verifyFetchWebhook(signedRequest("evt_attack", "v1=" + "0".repeat(64)), {
      secret,
      now: () => timestamp * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });
});
