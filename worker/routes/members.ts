import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  memberLinks,
  memberProfileImages,
  members,
  naverCafeSources,
} from "../../src/db/schema";
import { json } from "../utils/helpers";
import type { Env } from "../types";

const MEMBERS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const handleMembers = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  const pathParts = url.pathname.split("/");
  const code = pathParts[3] ? decodeURIComponent(pathParts[3]) : ""; // /api/members/:code

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
      const profile = await buildMemberProfile(db, fallback);
      return json(profile, 200, {
        headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
      });
    }
    const profile = await buildMemberProfile(db, data[0]);
    return json(profile, 200, {
      headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
    });
  }

  const activeData = await db.select().from(members).where(activeCondition);
  return json(activeData, 200, {
    headers: { "Cache-Control": MEMBERS_CACHE_CONTROL },
  });
};

type Db = ReturnType<typeof getDb>;
type MemberRow = typeof members.$inferSelect;

const toProfileImage = (
  row: typeof memberProfileImages.$inferSelect,
  member: MemberRow,
) => ({
  id: row.id,
  memberUid: row.member_uid,
  imageUrl: row.image_url,
  alt: row.alt ?? `${member.name} 프로필 이미지`,
  sortOrder: row.sort_order,
});

const buildFallbackImage = (member: MemberRow) => ({
  id: null,
  memberUid: member.uid,
  imageUrl: `/profile/${member.code}.webp`,
  alt: `${member.name} 프로필 이미지`,
  sortOrder: 0,
});

const buildMemberProfile = async (db: Db, member: MemberRow) => {
  const [imageRows, cafeRows, extraLinkRows] = await Promise.all([
    db
      .select()
      .from(memberProfileImages)
      .where(eq(memberProfileImages.member_uid, member.uid))
      .orderBy(memberProfileImages.sort_order, memberProfileImages.id),
    db
      .select()
      .from(naverCafeSources)
      .where(
        and(
          eq(naverCafeSources.member_uid, member.uid),
          eq(naverCafeSources.enabled, true),
        ),
      )
      .orderBy(naverCafeSources.sort_order, naverCafeSources.id),
    db
      .select()
      .from(memberLinks)
      .where(and(eq(memberLinks.member_uid, member.uid), eq(memberLinks.enabled, true)))
      .orderBy(memberLinks.sort_order, memberLinks.id),
  ]);

  const profileImages =
    imageRows.length > 0
      ? imageRows
          .map((row) => toProfileImage(row, member))
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0),
          )
      : [buildFallbackImage(member)];

  const links = [
    member.url_twitter
      ? {
          id: null,
          type: "x",
          label: "X",
          url: member.url_twitter,
          sortOrder: 10,
        }
      : null,
    ...cafeRows.map((source, index) => ({
      id: source.id,
      type: "naver_cafe",
      label: source.name || "네이버 카페",
      url: source.cafe_url,
      sortOrder: 20 + index,
      sourceId: source.id,
    })),
    member.url_youtube
      ? {
          id: null,
          type: "youtube",
          label: "YouTube",
          url: member.url_youtube,
          sortOrder: 40,
          youtubeChannelId: member.youtube_channel_id,
        }
      : null,
    member.url_chzzk
      ? {
          id: null,
          type: "chzzk",
          label: "CHZZK",
          url: member.url_chzzk,
          sortOrder: 50,
        }
      : null,
    ...extraLinkRows.map((link) => ({
      id: link.id,
      type: link.type,
      label: link.label,
      url: link.url,
      sortOrder: 100 + link.sort_order,
      youtubeChannelId: link.youtube_channel_id,
    })),
  ]
    .filter((link): link is NonNullable<typeof link> => Boolean(link))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    ...member,
    profileImages,
    links,
  };
};
