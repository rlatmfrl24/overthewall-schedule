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
const MEMBER_PROFILE_CACHE_CONTROL = "no-store";
const MAX_MEMBER_PROFILE_BACKGROUNDS = 3;
const MEMBER_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const PROFILE_BACKGROUND_KEY =
  /^members\/[^/]+\/backgrounds\/([^/]+)\/(original|w(?:960|1280|1672))\.webp$/;

const memberNotFound = () => new Response("Member not found", { status: 404 });

const decodeMemberCode = (rawCode: string) => {
  try {
    const code = decodeURIComponent(rawCode).trim();
    return MEMBER_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
};

export const handleMembers = async (request: Request, env: Env) => {
  const url = new URL(request.url);

  const pathParts = url.pathname.split("/");
  const rawCode = pathParts[3] ?? ""; // /api/members/:code
  const code = rawCode ? decodeMemberCode(rawCode) : "";
  if (rawCode && !code) {
    return memberNotFound();
  }

  const db = getDb(env);

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
        return memberNotFound();
      }
      const profile = await buildMemberProfile(db, fallback, env);
      return json(profile, 200, {
        headers: { "Cache-Control": MEMBER_PROFILE_CACHE_CONTROL },
      });
    }
    const profile = await buildMemberProfile(db, data[0], env);
    return json(profile, 200, {
      headers: { "Cache-Control": MEMBER_PROFILE_CACHE_CONTROL },
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

const buildMemberProfileBackgrounds = async (env: Env, member: MemberRow) => {
  if (!env.ASSET_BUCKET) {
    return [];
  }

  const prefix = `members/${member.code}/backgrounds/`;
  const listed = await env.ASSET_BUCKET.list({ prefix }).catch((error) => {
    console.warn("[members] failed to list profile backgrounds", {
      code: member.code,
      error,
    });
    return null;
  });

  if (!listed) {
    return [];
  }

  const variantsById = new Map<
    string,
    {
      variants: Set<string>;
      versionParts: string[];
    }
  >();

  for (const object of listed.objects) {
    const match = object.key.match(PROFILE_BACKGROUND_KEY);
    const backgroundId = match?.[1];
    const variant = match?.[2];

    if (!backgroundId || !variant) {
      continue;
    }

    const background = variantsById.get(backgroundId) ?? {
      variants: new Set<string>(),
      versionParts: [],
    };
    background.variants.add(variant);
    background.versionParts.push(
      `${variant}:${object.etag || object.uploaded?.getTime?.() || object.key}`,
    );
    variantsById.set(backgroundId, background);
  }

  return [...variantsById.entries()]
    .filter(([, background]) => background.variants.has("original"))
    .map(([id, background]) => ({
      id,
      sortOrder: id === "default" ? 0 : 1,
      version: background.versionParts.sort().join("|"),
    }))
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (a.id === "default"
          ? -1
          : b.id === "default"
            ? 1
            : a.id.localeCompare(b.id)),
    )
    .slice(0, MAX_MEMBER_PROFILE_BACKGROUNDS)
    .map((background, index) => ({
      ...background,
      sortOrder: index,
    }));
};

const buildMemberProfile = async (db: Db, member: MemberRow, env: Env) => {
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
  const backgroundImages = await buildMemberProfileBackgrounds(env, member);

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
    backgroundImages,
    links,
  };
};
