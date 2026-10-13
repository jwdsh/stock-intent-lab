import type { Strategy } from "./domain";

/** Only enable status exclusions whose data is available in the selected mode. */
export function defaultExclusions(mode: "demo" | "live"): Strategy["exclusions"] {
  return mode === "live" ? ["ST", "MISSING_DATA"] : ["ST", "SUSPENDED", "MISSING_DATA"];
}
