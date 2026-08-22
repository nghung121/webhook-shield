import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore } from "../src/index.js";

describe("InMemoryIdempotencyStore", () => {
  it("claims a key once and reports concurrent work without exposing its token", async () => {
    const store = new InMemoryIdempotencyStore({
      now: () => 1_000,
      tokenFactory: () => "lease-a",
    });

    const first = await store.claim({ key: "provider:event_123", leaseExpiresAt: new Date(2_000) });
    const second = await store.claim({ key: "provider:event_123", leaseExpiresAt: new Date(2_000) });

    expect(first).toEqual({ status: "claimed", token: "lease-a" });
    expect(second).toEqual({ status: "in_progress" });
  });

  it("does not permit a stale worker to complete a reclaimed key", async () => {
    let now = 1_000;
    let token = 0;
    const store = new InMemoryIdempotencyStore({
      now: () => now,
      tokenFactory: () => `lease-${++token}`,
    });
    const first = await store.claim({ key: "event_123", leaseExpiresAt: new Date(1_500) });
    now = 1_501;
    const replacement = await store.claim({ key: "event_123", leaseExpiresAt: new Date(2_000) });

    if (first.status !== "claimed" || replacement.status !== "claimed") throw new Error("test setup failed");
    await expect(store.complete({ key: "event_123", token: first.token })).resolves.toBe(false);
    await expect(store.complete({ key: "event_123", token: replacement.token })).resolves.toBe(true);
    await expect(store.claim({ key: "event_123", leaseExpiresAt: new Date(3_000) })).resolves.toEqual({
      status: "completed",
    });
  });

  it("does not permit a worker to complete after its lease expires", async () => {
    let now = 1_000;
    const store = new InMemoryIdempotencyStore({
      now: () => now,
      tokenFactory: () => "lease-a",
    });
    const claim = await store.claim({ key: "event_123", leaseExpiresAt: new Date(1_500) });
    if (claim.status !== "claimed") throw new Error("test setup failed");
    now = 1_501;

    await expect(store.complete({ key: "event_123", token: claim.token })).resolves.toBe(false);
  });

  it("admits exactly one claimant under concurrent calls", async () => {
    const store = new InMemoryIdempotencyStore({ now: () => 1_000 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.claim({ key: "event_123", leaseExpiresAt: new Date(2_000) }),
      ),
    );

    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "in_progress")).toHaveLength(19);
  });
});
