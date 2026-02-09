import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { members } from "../../src/db/schema";
import type { Env } from "../types";

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
      return Response.json(fallback);
    }
    return Response.json(data[0]);
  }

  const activeData = await db.select().from(members).where(activeCondition);
  return Response.json(activeData);
};
