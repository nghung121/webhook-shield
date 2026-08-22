import { randomUUID } from "node:crypto";

/** Storage boundary for coordinating duplicate webhook side effects. */
export interface IdempotencyStore {
  /** Atomically claim a key until the supplied lease expires. */
  claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult>;
  /** Mark a claim complete only when the caller still owns its lease token. */
  complete(input: IdempotencyCompleteInput): Promise<boolean>;
}

export interface IdempotencyClaimInput {
  key: string;
  leaseExpiresAt: Date;
}

export type IdempotencyClaimResult =
  | { status: "claimed"; token: string }
  | { status: "in_progress" }
  | { status: "completed" };

export interface IdempotencyCompleteInput {
  key: string;
  token: string;
}

export interface InMemoryIdempotencyStoreOptions {
  now?: () => number;
  tokenFactory?: () => string;
}

type Entry =
  | { status: "processing"; token: string; leaseExpiresAt: number }
  | { status: "completed" };

/**
 * A process-local idempotency reference adapter for tests and development.
 * It is not suitable for multiple processes or restarts. Production adapters
 * must execute claim/complete atomically and apply a bounded retention policy
 * for completed records.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly tokenFactory: () => string;

  public constructor(options: InMemoryIdempotencyStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.tokenFactory = options.tokenFactory ?? randomUUID;
  }

  public async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    if (!input.key) {
      throw new RangeError("Idempotency keys must not be empty.");
    }
    const leaseExpiresAt = input.leaseExpiresAt.getTime();
    if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= this.now()) {
      throw new RangeError("Idempotency leases must expire in the future.");
    }

    const current = this.entries.get(input.key);
    if (current?.status === "completed") {
      return { status: "completed" };
    }
    if (current?.status === "processing" && current.leaseExpiresAt > this.now()) {
      return { status: "in_progress" };
    }

    const token = this.tokenFactory();
    this.entries.set(input.key, { status: "processing", token, leaseExpiresAt });
    return { status: "claimed", token };
  }

  public async complete(input: IdempotencyCompleteInput): Promise<boolean> {
    const current = this.entries.get(input.key);
    if (
      current?.status !== "processing" ||
      current.token !== input.token ||
      current.leaseExpiresAt <= this.now()
    ) {
      return false;
    }
    this.entries.set(input.key, { status: "completed" });
    return true;
  }
}
