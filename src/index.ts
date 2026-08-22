import { createHmac, timingSafeEqual } from "node:crypto";

/** The possible outcomes of a webhook signature verification attempt. */
export type WebhookVerificationResult =
  | { ok: true; timestamp: number }
  | {
      ok: false;
      reason:
        | "expired_timestamp"
        | "future_timestamp"
        | "invalid_signature"
        | "malformed_signature"
        | "malformed_timestamp"
        | "invalid_configuration";
    };

/**
 * Inputs needed to validate a `v1=<hex>` HMAC-SHA256 webhook signature.
 *
 * `payload` must be the unmodified raw request body. Parsing and serializing
 * JSON before verification changes its bytes and therefore invalidates a
 * legitimate signature.
 */
export interface VerifyWebhookSignatureOptions {
  /** Shared signing secret supplied by the webhook provider. */
  secret: string | Uint8Array;
  /** Unmodified raw request body. */
  payload: string | Uint8Array;
  /** Header value in the form `v1=<hex>[, v1=<hex>]`. */
  signature: string;
  /** Unix epoch timestamp in seconds, normally from a separate request header. */
  timestamp: number | string;
  /** Maximum permitted clock skew in seconds. Defaults to five minutes. */
  toleranceSeconds?: number;
  /** Clock seam for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

const SHA256_HEX_LENGTH = 64;
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verifies a timestamped HMAC-SHA256 webhook signature without throwing for
 * untrusted request input. A valid signature is computed over
 * `${timestamp}.${rawPayload}`.
 */
export function verifyWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): WebhookVerificationResult {
  const timestamp = parseUnixTimestamp(options.timestamp);
  if (timestamp === undefined) {
    return { ok: false, reason: "malformed_timestamp" };
  }

  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 || !isNonEmpty(options.secret)) {
    return { ok: false, reason: "invalid_configuration" };
  }

  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1_000);
  if (!Number.isFinite(nowSeconds)) {
    return { ok: false, reason: "invalid_configuration" };
  }

  if (timestamp < nowSeconds - toleranceSeconds) {
    return { ok: false, reason: "expired_timestamp" };
  }

  if (timestamp > nowSeconds + toleranceSeconds) {
    return { ok: false, reason: "future_timestamp" };
  }

  const signatures = parseV1Signatures(options.signature);
  if (signatures.length === 0) {
    return { ok: false, reason: "malformed_signature" };
  }

  const expected = createHmac("sha256", options.secret)
    .update(String(timestamp), "utf8")
    .update(".", "utf8")
    .update(options.payload)
    .digest();

  for (const signature of signatures) {
    const candidate = Buffer.from(signature, "hex");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true, timestamp };
    }
  }

  return { ok: false, reason: "invalid_signature" };
}

function parseUnixTimestamp(value: number | string): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function parseV1Signatures(header: string): string[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const [version, signature, ...extra] = part.split("=");
      if (
        version !== "v1" ||
        extra.length > 0 ||
        signature === undefined ||
        !new RegExp(`^[0-9a-fA-F]{${SHA256_HEX_LENGTH}}$`).test(signature)
      ) {
        return [];
      }
      return [signature];
    });
}

function isNonEmpty(value: string | Uint8Array): boolean {
  return typeof value === "string" ? value.length > 0 : value.byteLength > 0;
}
