import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { members } from "../../src/db/schema";
import { json } from "../utils/helpers";
import type { Env } from "../types";

const MEMBERS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const handleMembers = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  const pathParts = url.pathname.split("/");
  const code = pathParts[3]; // /api/members/:code

  const activeCondition = sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;

  if (code) {
    const normalizedCode = code.trim().toLowerCase();
    const data = await db
      .select()
      .from(members)
      .where(and(eq(members.code, code), activeCondition))
      .limit(1);

    if (data.length === 0 || data[0]?.code !== code) {
      const allMembers = await db.select().from(members).where(activeCondition);
      const fallback = allMembers.find(
        (member) => member.code?.trim().toLowerCase() === normalizedCode,
      );
      if (!fallback) {
        return new Response("Member not found", { status: 404 });
      }
      return json(fallback, 200, {
        headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
      });
    }
    return json(data[0], 200, {
      headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
    });
  }

  const activeData = await db.select().from(members).where(activeCondition);
  return json(activeData, 200, {
    headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
  });
};
