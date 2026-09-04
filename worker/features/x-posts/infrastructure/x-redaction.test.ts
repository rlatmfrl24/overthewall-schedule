import { describe, expect, it } from "vitest";
import { redactStoredXPosts } from "./x-api";

describe("X post redaction", () => {
  it("heals the facts tombstone on an idempotent retry", async () => {
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind: () => ({
            all: async () => ({ results: [{ id: "12345678901" }] }),
            run: async () => ({
              meta: { changes: sql.includes("UPDATE x_posts") ? 0 : 1 },
            }),
          }),
        };
      },
      batch: async (queries: D1PreparedStatement[]) =>
        Promise.all(queries.map((query) => query.run())),
    } as unknown as D1Database;

    const result = await redactStoredXPosts(db, ["12345678901"]);

    expect(result).toMatchObject({ found: 1, redacted: 0, reason: "admin" });
    expect(statements.some((sql) => sql.includes("UPDATE x_post_facts"))).toBe(
      true,
    );
  });

  it("does not create a facts tombstone for an unknown post", async () => {
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind: () => ({
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0 } }),
          }),
        };
      },
    } as unknown as D1Database;

    const result = await redactStoredXPosts(db, ["12345678901"]);

    expect(result).toMatchObject({ found: 0, redacted: 0 });
    expect(statements.some((sql) => sql.includes("UPDATE x_post_facts"))).toBe(
      false,
    );
  });
});
