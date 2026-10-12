import { describe, expect, it } from "vitest";
import { POST as parsePost } from "@/app/api/parse/route";
import { POST as screenPost } from "@/app/api/screen/route";

describe("API routes", () => {
  it("parses a valid intent", async () => {
    const response = await parsePost(new Request("http://localhost/api/parse", {
      method: "POST", body: JSON.stringify({ query: "低估值、走势稳定" }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.strategy.conditions).toHaveLength(2);
  });

  it("rejects an empty intent", async () => {
    const response = await parsePost(new Request("http://localhost/api/parse", {
      method: "POST", body: JSON.stringify({ query: "" }),
    }));
    expect(response.status).toBe(400);
  });

  it("screens a valid strategy and rejects conflicting input", async () => {
    const base = {
      id: "api-test", name: "API 测试", originalQuery: "", logic: "AND",
      exclusions: ["ST", "SUSPENDED", "MISSING_DATA"],
    };
    const valid = await screenPost(new Request("http://localhost/api/screen", {
      method: "POST", body: JSON.stringify({ ...base, conditions: [{ id: "pe", metric: "pe_ttm", operator: "<", value: 30, enabled: true }] }),
    }));
    expect(valid.status).toBe(200);
    expect((await valid.json()).total).toBe(12);

    const invalid = await screenPost(new Request("http://localhost/api/screen", {
      method: "POST", body: JSON.stringify({ ...base, conditions: [
        { id: "one", metric: "pe_ttm", operator: "<", value: 10, enabled: true },
        { id: "two", metric: "pe_ttm", operator: ">", value: 30, enabled: true },
      ] }),
    }));
    expect(invalid.status).toBe(422);
  });
});
