import type { StockRecord } from "./domain";

export interface StockSnapshot {
  id: string;
  fetchedAt: string;
  expiresAt: string;
  stocks: StockRecord[];
}

/** One server-process snapshot, shared by concurrent requests. No secret in cache IDs. */
export function createSnapshotCache(load: () => Promise<StockRecord[]>, ttlMs = 10 * 60_000) {
  let cached: StockSnapshot | undefined;
  let pending: Promise<StockSnapshot> | undefined;
  let configKey: string | undefined;
  let generation = 0;
  return async (key: string) => {
    if (configKey !== key) { cached = undefined; pending = undefined; configKey = key; generation++; }
    if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached;
    if (pending) return pending;
    const requestGeneration = generation;
    const request = load().then((stocks) => {
      const now = Date.now();
      const snapshot = { id: crypto.randomUUID(), fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), stocks };
      if (generation === requestGeneration) cached = snapshot;
      return snapshot;
    });
    pending = request;
    try { return await request; } finally { if (pending === request) pending = undefined; }
  };
}
