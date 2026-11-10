import { contentRowMovedSql, publicationHiddenSql } from "../../content-access";
import type { SiteId } from "@contracts/site-definition";

export const youtubeFeedMemberSql = (siteId: SiteId, alias: string) => `
  ${alias}.content_access = 'normal' AND (${alias}.is_deprecated IS NULL OR ${alias}.is_deprecated != 1)
  AND NOT (${publicationHiddenSql("members", alias, siteId)})`;

// Keep incomplete registrations available to the dashboard for diagnostics.
export const officialChannelRegistrationsSql = (siteId: SiteId) => `
  SELECT member.youtube_channel_id, member.name, 'official' AS role, member.uid AS member_uid
  FROM members member WHERE ${youtubeFeedMemberSql(siteId, "member")}
  UNION ALL
  SELECT link.youtube_channel_id, member.name || ' · ' || link.label, 'vod', member.uid
  FROM member_links link JOIN members member ON member.uid = link.member_uid
  WHERE link.type = 'youtube_vod' AND link.enabled = 1 AND ${youtubeFeedMemberSql(siteId, "member")}`;

export const officialChannelTargetsSql = (siteId: SiteId) => `
  SELECT youtube_channel_id, COALESCE(MIN(CASE WHEN role = 'official' THEN member_uid END), MIN(member_uid)) AS member_uid
  FROM (${officialChannelRegistrationsSql(siteId)})
  WHERE (role = 'official' AND length(trim(youtube_channel_id)) > 0)
    OR (role = 'vod' AND length(youtube_channel_id) = 24 AND substr(youtube_channel_id, 1, 2) = 'UC'
      AND youtube_channel_id NOT GLOB '*[^A-Za-z0-9_-]*')
  GROUP BY youtube_channel_id`;

export const youtubeFeedSourceMovedSql = (siteId: SiteId, alias: string) =>
  `(${contentRowMovedSql("youtube_feed_sources", alias)} OR ${publicationHiddenSql("youtube_feed_sources", alias, siteId)})`;

export const youtubeFeedSourceBlockedSql = (siteId: SiteId, alias: string) =>
  `(${youtubeFeedSourceMovedSql(siteId, alias)} OR EXISTS (
    SELECT 1 FROM members inactive_owner WHERE inactive_owner.uid = ${alias}.member_uid
      AND NOT (${youtubeFeedMemberSql(siteId, "inactive_owner")})
  ))`;
