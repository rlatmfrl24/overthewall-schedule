import {
  AiReviewError,
  type AiReviewContext,
} from "../application/ports/ai-review";
import { D1AdminCatalogRepository } from "./d1-admin-catalog-repository";
import { D1IngestionRepository } from "./d1-ingestion-repository";
export class D1AiReviewContext implements AiReviewContext {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async candidate(id: string) {
    try {
      return await new D1IngestionRepository(this.db).readReviewCandidate(
        null,
        id,
      );
    } catch {
      throw new AiReviewError(
        "not_found",
        "검수 후보를 찾을 수 없습니다.",
        404,
      );
    }
  }
  async catalog(options?: { membersOnly?: boolean }) {
    const [catalog, aliases, members, links] = await Promise.all([
      new D1AdminCatalogRepository(this.db).readCatalog({ references: !options?.membersOnly, memberEntities: options?.membersOnly }),
      this.db
        .prepare(
          `SELECT entity_id,alias FROM music_entity_aliases ${options?.membersOnly ? "WHERE entity_id IN (SELECT id FROM music_entities WHERE member_uid IS NOT NULL)" : ""} ORDER BY entity_id,normalized_alias`,
        )
        .all<{ entity_id: string; alias: string }>(),
      this.db.prepare("SELECT uid,name,youtube_channel_id,url_chzzk FROM members WHERE COALESCE(is_deprecated,0)=0 ORDER BY uid")
        .all<{ uid: number; name: string; youtube_channel_id: string | null; url_chzzk: string | null }>(),
      this.db.prepare("SELECT member_uid,type,youtube_channel_id FROM member_links WHERE enabled=1 AND youtube_channel_id IS NOT NULL ORDER BY member_uid,id")
        .all<{ member_uid: number; type: string; youtube_channel_id: string }>(),
    ]);
    const entityAliases: Record<string, string[]> = {};
    for (const row of aliases.results)
      (entityAliases[row.entity_id] ??= []).push(row.alias);
    return { ...catalog, entityAliases, members: members.results.map((member) => {
      const entities = catalog.entities.filter((e) => e.memberUid === member.uid && e.archivedAt === null);
      const memberLinks = links.results.filter((link) => link.member_uid === member.uid);
      return {
        uid: member.uid,
        chzzkChannelId: member.url_chzzk?.match(/^https:\/\/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})(?:[/?#]|$)/i)?.[1] ?? null,
        name: member.name,
        aliases: [...new Set(entities.flatMap((e) => [e.displayName, ...(entityAliases[e.id] ?? [])]))].filter((name) => name !== member.name),
        youtubeChannelIds: [...new Set([member.youtube_channel_id, ...memberLinks.map((link) => link.youtube_channel_id)].filter((id): id is string => Boolean(id)))],
        youtubeVodChannelIds: memberLinks.filter((link) => link.type === "youtube_vod").map((link) => link.youtube_channel_id),
      };
    }) };
  }
}
