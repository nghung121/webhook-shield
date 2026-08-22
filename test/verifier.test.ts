import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/index.js";

const secret = "whsec_test-secret";
const payload = '{"event":"payment.succeeded"}';
const timestamp = 1_700_000_000;

function sign(value: string, signedTimestamp = timestamp): string {
  return createHmac("sha256", secret)
    .update(`${signedTimestamp}.${value}`, "utf8")
    .digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid v1 HMAC-SHA256 signature", () => {
    const result = verifyWebhookSignature({
      secret,
      payload,
      signature: `v1=${sign(payload)}`,
      timestamp,
      now: () => (timestamp + 60) * 1_000,
    });

    expect(result).toEqual({ ok: true, timestamp });
  });

  it("rejects a payload modified after signing", () => {
    const result = verifyWebhookSignature({
      secret,
      payload: '{"event":"payment.failed"}',
      signature: `v1=${sign(payload)}`,
      timestamp,
      now: () => (timestamp + 60) * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("accepts one matching signature from a rotated-key header", () => {
    const result = verifyWebhookSignature({
      secret,
      payload,
      signature: `v1=not-a-real-signature, v1=${sign(payload)}`,
      timestamp,
      now: () => (timestamp + 60) * 1_000,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects expired timestamps before accepting their valid signature", () => {
    const result = verifyWebhookSignature({
      secret,
      payload,
      signature: `v1=${sign(payload)}`,
      timestamp,
      toleranceSeconds: 300,
      now: () => (timestamp + 301) * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "expired_timestamp" });
  });

  it("rejects timestamps too far in the future", () => {
    const result = verifyWebhookSignature({
      secret,
      payload,
      signature: `v1=${sign(payload)}`,
      timestamp,
      toleranceSeconds: 300,
      now: () => (timestamp - 301) * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "future_timestamp" });
  });

  it("rejects malformed signatures without throwing", () => {
    const result = verifyWebhookSignature({
      secret,
      payload,
      signature: "v1=not-hex",
      timestamp,
      now: () => timestamp * 1_000,
    });

    expect(result).toEqual({ ok: false, reason: "malformed_signature" });
  });
});
