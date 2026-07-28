import { json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  listActiveMembers,
  readMemberProfile,
} from "../application/read-members";
import type { MemberReader } from "../application/ports/member-reader";

const MEMBERS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const MEMBER_PROFILE_CACHE_CONTROL = "no-store";
const MEMBER_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

const memberNotFound = () => new Response("Member not found", { status: 404 });

const decodeMemberCode = (rawCode: string) => {
  try {
    const code = decodeURIComponent(rawCode).trim();
    return MEMBER_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
};

export type MemberReaderResolver = (env: Env) => MemberReader;

export const createHandleMembers =
  (resolveReader: MemberReaderResolver) =>
  async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== "GET") return methodNotAllowed();

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    if (
      pathParts[1] !== "api" ||
      pathParts[2] !== "members" ||
      pathParts.length > 4
    ) {
      return new Response(null, { status: 404 });
    }

    const rawCode = pathParts[3] ?? "";
    const code = rawCode ? decodeMemberCode(rawCode) : "";
    if (rawCode && !code) return memberNotFound();

    const reader = resolveReader(env);
    if (code) {
      const profile = await readMemberProfile(reader, code);
      if (!profile) return memberNotFound();
      return json(profile, 200, {
        headers: { "Cache-Control": MEMBER_PROFILE_CACHE_CONTROL },
      });
    }

    return json(await listActiveMembers(reader), 200, {
      headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
    });
  };
