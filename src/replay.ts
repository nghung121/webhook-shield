/** An atomic, durable storage boundary for webhook replay keys. */
export interface ReplayStore {
  /**
   * Atomically records `key` until `expiresAt` and reports whether this is the
   * first consumer. Production implementations must make this one operation,
   * for example Redis `SET key value NX PX` or a database unique insert.
   */
  consume(input: ReplayConsumeInput): Promise<ReplayConsumeResult>;
}

export interface ReplayConsumeInput {
  /** A namespaced, non-secret stable delivery identifier. */
  key: string;
  /** The moment after which the key may be accepted again. */
  expiresAt: Date;
}

export type ReplayConsumeResult =
  | { status: "accepted" }
  | { status: "replayed" }
  | { status: "expired" };

export interface InMemoryReplayStoreOptions {
  /** Test seam; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * A deterministic replay store for tests and one-process development.
 *
 * It is intentionally not a production distributed-store implementation:
 * restarts and multi-instance deployments lose its state. Use a durable
 * `ReplayStore` adapter in production.
 */
export class InMemoryReplayStore implements ReplayStore {
  private readonly entries = new Map<string, number>();
  private readonly now: () => number;

  public constructor(options: InMemoryReplayStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  public async consume(input: ReplayConsumeInput): Promise<ReplayConsumeResult> {
    if (!input.key) {
      throw new RangeError("Replay keys must not be empty.");
    }

    const now = this.now();
    const expiresAt = input.expiresAt.getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return { status: "expired" };
    }

    const currentExpiry = this.entries.get(input.key);
    if (currentExpiry !== undefined && currentExpiry > now) {
      return { status: "replayed" };
    }

    this.entries.set(input.key, expiresAt);
    return { status: "accepted" };
  }
}
