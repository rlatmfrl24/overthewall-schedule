import { describe, expect, it } from "vitest";
import { parseJsonRequest } from "./json";

describe("parseJsonRequest", () => {
  it("returns a 400 response for malformed JSON", async () => {
    const result = await parseJsonRequest(
      new Request("https://example.com/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.text()).toBe("Malformed JSON");
    }
  });

  it("returns a typed value for valid JSON", async () => {
    const result = await parseJsonRequest<{ id: number }>(
      new Request("https://example.com/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1 }),
      }),
    );

    expect(result).toEqual({ ok: true, value: { id: 1 } });
  });
});
