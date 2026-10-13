import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotCache } from "@/lib/snapshot-cache";
import { DEMO_STOCKS } from "@/lib/demo-data";

afterEach(() => vi.useRealTimers());

describe("snapshot cache", () => {
  it("reuses data for condition changes and reloads after expiry", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const load = vi.fn(async () => DEMO_STOCKS);
    const get = createSnapshotCache(load, 100);
    const first = await get("config");
    expect(await get("config")).toBe(first);
    vi.setSystemTime(1100);
    expect((await get("config")).id).not.toBe(first.id);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("coalesces simultaneous requests", async () => {
    const load = vi.fn(async () => DEMO_STOCKS);
    const get = createSnapshotCache(load);
    const [a, b] = await Promise.all([get("same"), get("same")]);
    expect(a).toBe(b); expect(load).toHaveBeenCalledTimes(1);
  });
  it("does not cache failures", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(DEMO_STOCKS);
    const get = createSnapshotCache(load);
    await expect(get("same")).rejects.toThrow("offline");
    expect((await get("same")).stocks).toHaveLength(12);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("invalidates configuration and never lets an older generation overwrite it", async () => {
    let resolveOld!: (value: typeof DEMO_STOCKS) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(DEMO_STOCKS);
    const get = createSnapshotCache(load);
    const old = get("A"); await get("B"); const newest = await get("A");
    resolveOld([]); await old;
    expect(await get("A")).toBe(newest); expect(load).toHaveBeenCalledTimes(3);
  });
});
