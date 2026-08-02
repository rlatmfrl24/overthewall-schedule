import type { Notice, NoticeLinkDto } from "./types";

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : [];

export const getNoticeLinks = (notice: Notice): NoticeLinkDto[] => {
  if (Array.isArray(notice.links) && notice.links.length > 0) {
    return notice.links.filter(
      (link) => Boolean(link?.label?.trim()) && Boolean(link?.url?.trim()),
    );
  }
  const legacyUrl = notice.url?.trim();
  return legacyUrl ? [{ label: "자세히 보기", url: legacyUrl }] : [];
};

export const getNoticeImageUrls = (notice: Notice) => {
  const imageUrls = normalizeStringArray(notice.image_urls);
  if (imageUrls.length > 0) return imageUrls;
  const legacyUrl = notice.thumbnail_url?.trim();
  return legacyUrl ? [legacyUrl] : [];
};

export const getNoticeRelatedMemberUids = (notice: Notice) => {
  if (Array.isArray(notice.related_member_uids)) {
    return notice.related_member_uids.filter(
      (uid): uid is number => Number.isInteger(uid) && uid > 0,
    );
  }
  return notice.publisher_type === "member" && notice.publisher_member_uid
    ? [notice.publisher_member_uid]
    : [];
};
