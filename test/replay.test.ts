import { describe, expect, it } from "vitest";
import { InMemoryReplayStore } from "../src/index.js";

describe("InMemoryReplayStore", () => {
  it("accepts a replay key only once before it expires", async () => {
    const store = new InMemoryReplayStore({ now: () => 1_000 });
    const input = { key: "provider:event_123", expiresAt: new Date(2_000) };

    await expect(store.consume(input)).resolves.toEqual({ status: "accepted" });
    await expect(store.consume(input)).resolves.toEqual({ status: "replayed" });
  });

  it("rejects a key whose expiry is already in the past", async () => {
    const store = new InMemoryReplayStore({ now: () => 2_000 });

    await expect(store.consume({ key: "event_123", expiresAt: new Date(1_999) })).resolves.toEqual({
      status: "expired",
    });
  });

  it("allows a key again after its earlier lease has expired", async () => {
    let now = 1_000;
    const store = new InMemoryReplayStore({ now: () => now });

    await store.consume({ key: "event_123", expiresAt: new Date(1_500) });
    now = 1_501;

    await expect(store.consume({ key: "event_123", expiresAt: new Date(2_000) })).resolves.toEqual({
      status: "accepted",
    });
  });

  it("admits exactly one concurrent consumer for a key", async () => {
    const store = new InMemoryReplayStore({ now: () => 1_000 });
    const input = { key: "event_123", expiresAt: new Date(2_000) };

    const results = await Promise.all(Array.from({ length: 20 }, () => store.consume(input)));

    expect(results.filter((result) => result.status === "accepted")).toHaveLength(1);
    expect(results.filter((result) => result.status === "replayed")).toHaveLength(19);
  });
});
