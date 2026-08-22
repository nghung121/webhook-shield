import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyFetchWebhook } from "../src/index.js";

const secret = "whsec_fetch-secret";
const timestamp = 1_700_000_000;

function signatureFor(payload: Uint8Array): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(payload)
    .digest("hex");
}

function webhookRequest(payload: Uint8Array, headers: HeadersInit = {}): Request {
  return new Request("https://example.test/webhook", {
    method: "POST",
    headers: {
      "x-webhook-signature": `v1=${signatureFor(payload)}`,
      "x-webhook-timestamp": String(timestamp),
      ...headers,
    },
    body: payload,
  });
}

describe("verifyFetchWebhook", () => {
  it("verifies the exact binary request body and returns it to the caller", async () => {
    const payload = Uint8Array.from([0, 255, 10, 13, 128]);

    const result = await verifyFetchWebhook(webhookRequest(payload), {
      secret,
      now: () => timestamp * 1_000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
      expect(result.timestamp).toBe(timestamp);
    }
  });

  it("fails closed when a required signature header is missing", async () => {
    const payload = new TextEncoder().encode("{}");
    const result = await verifyFetchWebhook(
      webhookRequest(payload, { "x-webhook-signature": "" }),
      { secret, now: () => timestamp * 1_000 },
    );

    expect(result).toEqual({ ok: false, reason: "missing_signature_header" });
  });

  it("rejects bodies exceeding the configured byte limit", async () => {
    const payload = new TextEncoder().encode("0123456789");
    const result = await verifyFetchWebhook(webhookRequest(payload), {
      secret,
      maxPayloadBytes: 9,
      now: () => timestamp * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "payload_too_large" });
  });

  it("allows custom provider header names", async () => {
    const payload = new TextEncoder().encode("{}");
    const result = await verifyFetchWebhook(
      new Request("https://example.test/webhook", {
        method: "POST",
        headers: {
          "x-provider-signature": `v1=${signatureFor(payload)}`,
          "x-provider-timestamp": String(timestamp),
        },
        body: payload,
      }),
      {
        secret,
        signatureHeader: "x-provider-signature",
        timestampHeader: "x-provider-timestamp",
        now: () => timestamp * 1_000,
      },
    );

    expect(result.ok).toBe(true);
  });
});
