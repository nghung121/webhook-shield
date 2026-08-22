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

/** Options for verifying a standard Fetch API `Request`. */
export interface VerifyFetchWebhookOptions
  extends Omit<VerifyWebhookSignatureOptions, "payload" | "signature" | "timestamp"> {
  /** Header carrying the `v1=<hex>` signature. Defaults to `x-webhook-signature`. */
  signatureHeader?: string;
  /** Header carrying the Unix timestamp in seconds. Defaults to `x-webhook-timestamp`. */
  timestampHeader?: string;
  /** Maximum accepted raw body size. Defaults to 1 MiB. */
  maxPayloadBytes?: number;
}

/** Verification outcome that includes the exact raw request bytes on success. */
export type FetchWebhookVerificationResult =
  | { ok: true; timestamp: number; payload: Uint8Array }
  | Exclude<WebhookVerificationResult, { ok: true }>
  | { ok: false; reason: "missing_signature_header" | "missing_timestamp_header" | "payload_too_large" | "unreadable_body" };

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

/**
 * Reads and verifies a Fetch-standard request once. The returned bytes are the
 * same bytes that were authenticated; parse them only after a successful
 * result. This helper enforces a byte limit while streaming the body.
 */
export async function verifyFetchWebhook(
  request: Request,
  options: VerifyFetchWebhookOptions,
): Promise<FetchWebhookVerificationResult> {
  const signatureHeader = options.signatureHeader ?? "x-webhook-signature";
  const timestampHeader = options.timestampHeader ?? "x-webhook-timestamp";
  const signature = request.headers.get(signatureHeader);
  const timestamp = request.headers.get(timestampHeader);

  if (!signature) {
    return { ok: false, reason: "missing_signature_header" };
  }
  if (!timestamp) {
    return { ok: false, reason: "missing_timestamp_header" };
  }

  const maxPayloadBytes = options.maxPayloadBytes ?? 1_048_576;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 0) {
    return { ok: false, reason: "invalid_configuration" };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  const payload = await readBoundedRequestBody(request, maxPayloadBytes);
  if (payload === "payload_too_large" || payload === "unreadable_body") {
    return { ok: false, reason: payload };
  }

  const verification = verifyWebhookSignature({
    ...options,
    payload,
    signature,
    timestamp,
  });

  return verification.ok ? { ...verification, payload } : verification;
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

async function readBoundedRequestBody(
  request: Request,
  maxPayloadBytes: number,
): Promise<Uint8Array | "payload_too_large" | "unreadable_body"> {
  if (request.bodyUsed) {
    return "unreadable_body";
  }
  if (request.body === null) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxPayloadBytes) {
        await reader.cancel();
        return "payload_too_large";
      }
      chunks.push(value);
    }
  } catch {
    return "unreadable_body";
  } finally {
    reader.releaseLock();
  }

  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return payload;
}
