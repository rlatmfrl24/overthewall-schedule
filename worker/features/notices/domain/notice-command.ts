import { MAX_NOTICE_IMAGES, MAX_NOTICE_LINKS, type NoticeLinkDto } from "../../../../contracts/notices";

export interface NoticeWriteInput {
  content: string;
  links: NoticeLinkDto[];
  imageUrls: string[];
  relatedMemberUids: number[];
  type: string;
  isActive: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export type NoticeCommand = { action: "create"; input: NoticeWriteInput }
  | { action: "update"; id: number; input: NoticeWriteInput }
  | { action: "delete" | "feature"; id: number };

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const httpUrl = (value: string) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };

/** Receives the owning HTTP parser's normalized input, never raw SQL or rows. */
export function parseNoticeCommand(value: unknown): NoticeCommand | null {
  if (!object(value)) return null;
  if (value.action === "delete" || value.action === "feature") return positiveId(value.id) ? { action: value.action, id: value.id } : null;
  if (value.action !== "create" && value.action !== "update" || value.action === "update" && !positiveId(value.id)) return null;
  const input = value.input;
  if (!object(input) || typeof input.content !== "string" || !input.content.trim() || input.content !== input.content.trim()
    || !Array.isArray(input.links) || input.links.length > MAX_NOTICE_LINKS || input.links.some(link => !object(link) || typeof link.label !== "string" || !link.label.trim() || typeof link.url !== "string" || !httpUrl(link.url))
    || new Set(input.links.map(link => link.url)).size !== input.links.length
    || !Array.isArray(input.imageUrls) || input.imageUrls.length > MAX_NOTICE_IMAGES || input.imageUrls.some(url => typeof url !== "string" || !url || !url.startsWith("/") && !httpUrl(url))
    || new Set(input.imageUrls).size !== input.imageUrls.length
    || !Array.isArray(input.relatedMemberUids) || input.relatedMemberUids.some(uid => !positiveId(uid)) || new Set(input.relatedMemberUids).size !== input.relatedMemberUids.length
    || !["notice", "event"].includes(String(input.type)) || typeof input.isActive !== "boolean"
    || !(input.startedAt === null || typeof input.startedAt === "string") || !(input.endedAt === null || typeof input.endedAt === "string")) return null;
  const normalized: NoticeWriteInput = { content: input.content, links: input.links.map(link => ({ label: link.label as string, url: link.url as string })), imageUrls: [...input.imageUrls], relatedMemberUids: [...input.relatedMemberUids], type: input.type as string, isActive: input.isActive, startedAt: input.startedAt, endedAt: input.endedAt };
  return value.action === "create" ? { action: "create", input: normalized } : { action: "update", id: value.id as number, input: normalized };
}

export function parseLocalNoticeCommand(value: unknown) {
  if (!object(value) || !["create", "update", "delete", "feature"].includes(String(value.action)) || !Array.isArray(value.affectedIds) || value.affectedIds.some(id => !positiveId(id))) return null;
  return { action: value.action as NoticeCommand["action"], affectedIds: [...new Set(value.affectedIds as number[])].sort((a, b) => a - b) };
}
