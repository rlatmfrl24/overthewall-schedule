import { and, eq, sql } from "drizzle-orm";
import {
  memberLinks,
  memberProfileImages,
  members,
  naverCafeSources,
} from "@db/schema";
import type {
  MemberDto,
  MemberProfileDto,
  MemberProfileLinkDto,
} from "../../../../contracts/members";
import type { DbInstance } from "../../../platform/db";
import type { MemberReader } from "../application/ports/member-reader";

const MAX_MEMBER_PROFILE_BACKGROUNDS = 3;
const PROFILE_BACKGROUND_KEY =
  /^members\/[^/]+\/backgrounds\/([^/]+)\/(original|w(?:960|1280|1672))\.webp$/;

type MemberRow = typeof members.$inferSelect;

const activeCondition =
  sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;

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

export class D1MemberReader implements MemberReader {
  private readonly db: DbInstance;
  private readonly assetBucket?: R2Bucket;

  constructor(
    db: DbInstance,
    assetBucket?: R2Bucket,
  ) {
    this.db = db;
    this.assetBucket = assetBucket;
  }

  async listActive(): Promise<MemberDto[]> {
    return this.db
      .select()
      .from(members)
      .where(activeCondition) as Promise<MemberDto[]>;
  }

  async findProfileByCode(code: string): Promise<MemberProfileDto | null> {
    const normalizedCode = code.trim().toLowerCase();
    const data = await this.db
      .select()
      .from(members)
      .where(and(eq(members.code, code), activeCondition))
      .limit(1);

    let member: MemberRow | undefined = data[0];
    if (!member || member.code !== code) {
      const allMembers = await this.db
        .select()
        .from(members)
        .where(activeCondition);
      member = allMembers.find(
        (candidate) =>
          candidate.code?.trim().toLowerCase() === normalizedCode,
      );
    }

    if (!member) return null;
    return this.buildProfile(member);
  }

  private async buildProfile(member: MemberRow): Promise<MemberProfileDto> {
    const [imageRows, cafeRows, extraLinkRows, backgroundImages] =
      await Promise.all([
        this.db
          .select()
          .from(memberProfileImages)
          .where(eq(memberProfileImages.member_uid, member.uid))
          .orderBy(memberProfileImages.sort_order, memberProfileImages.id),
        this.db
          .select()
          .from(naverCafeSources)
          .where(
            and(
              eq(naverCafeSources.member_uid, member.uid),
              eq(naverCafeSources.enabled, true),
            ),
          )
          .orderBy(naverCafeSources.sort_order, naverCafeSources.id),
        this.db
          .select()
          .from(memberLinks)
          .where(
            and(
              eq(memberLinks.member_uid, member.uid),
              eq(memberLinks.enabled, true),
            ),
          )
          .orderBy(memberLinks.sort_order, memberLinks.id),
        this.listProfileBackgrounds(member),
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
            type: "x" as const,
            label: "X",
            url: member.url_twitter,
            sortOrder: 10,
          }
        : null,
      ...cafeRows.map((source, index) => ({
        id: source.id,
        type: "naver_cafe" as const,
        label: source.name || "네이버 카페",
        url: source.cafe_url,
        sortOrder: 20 + index,
        sourceId: source.id,
      })),
      member.url_youtube
        ? {
            id: null,
            type: "youtube" as const,
            label: "YouTube",
            url: member.url_youtube,
            sortOrder: 40,
            youtubeChannelId: member.youtube_channel_id,
          }
        : null,
      member.url_chzzk
        ? {
            id: null,
            type: "chzzk" as const,
            label: "CHZZK",
            url: member.url_chzzk,
            sortOrder: 50,
          }
        : null,
      ...extraLinkRows.map((link) => ({
        id: link.id,
        type: link.type as MemberProfileLinkDto["type"],
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
  }

  private async listProfileBackgrounds(member: MemberRow) {
    if (!this.assetBucket) return [];

    const prefix = `members/${member.code}/backgrounds/`;
    const listed = await this.assetBucket.list({ prefix }).catch((error) => {
      console.warn("[members] failed to list profile backgrounds", {
        code: member.code,
        error,
      });
      return null;
    });
    if (!listed) return [];

    const variantsById = new Map<
      string,
      { variants: Set<string>; versionParts: string[] }
    >();
    for (const object of listed.objects) {
      const match = object.key.match(PROFILE_BACKGROUND_KEY);
      const backgroundId = match?.[1];
      const variant = match?.[2];
      if (!backgroundId || !variant) continue;

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
      .map((background, index) => ({ ...background, sortOrder: index }));
  }
}
