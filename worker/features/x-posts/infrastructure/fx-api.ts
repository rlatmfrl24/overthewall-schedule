import type { XLinkedPostPreviewDto, XPostDto, XPostMediaDto } from "@contracts/x-posts";
import { FxCandidateExcludedError } from "../ports/fx-rss-collection";
export { FxCandidateExcludedError } from "../ports/fx-rss-collection";

export class FxApiError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
const invalid = (): never => { throw new FxApiError("fx_invalid_payload"); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const id = (value: unknown) => typeof value === "string" && /^\d{1,25}$/.test(value) ? value : invalid();
const handle = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_]{1,15}$/.test(value) ? value.toLowerCase() : invalid();
export { id as parseFxId, handle as parseFxHandle };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const webUrl = (value: unknown, media = false): string => {
  if (typeof value !== "string") return invalid();
  try {
    const url = new URL(value);
    if ((media ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) || url.username || url.password || (media && !["pbs.twimg.com", "video.twimg.com"].includes(url.hostname))) return invalid();
    return url.href;
  } catch { return invalid(); }
};
const parseMedia = (value: unknown): XPostMediaDto[] => {
  if (value === undefined || value === null) return [];
  const all = object(value).all;
  if (all === undefined) return [];
  if (!Array.isArray(all) || all.length > 16) return invalid();
  return all.map(item => {
    const raw = object(item);
    const type = raw.type === "gif" ? "animated_gif" : raw.type;
    if (type !== "photo" && type !== "video" && type !== "animated_gif") return invalid();
    return { mediaKey: id(raw.id), type, url: webUrl(raw.url, true), previewImageUrl: raw.thumbnail_url ? webUrl(raw.thumbnail_url, true) : null, width: number(raw.width) || null, height: number(raw.height) || null, altText: typeof raw.alt_text === "string" ? raw.alt_text : null };
  });
};
const parseStatus = (value: unknown, preview = false): XPostDto => {
  const raw = object(value), author = object(raw.author);
  const postId = id(raw.id), username = handle(author.screen_name);
  if (author.protected !== false) throw new FxApiError("fx_private_author");
  const createdAt = typeof raw.created_at === "string" ? Date.parse(raw.created_at) : NaN;
  if (!Number.isFinite(createdAt) || typeof raw.text !== "string" || raw.text.length > 100_000) return invalid();
  const post: XPostDto = {
    id: postId, username, text: raw.text, createdAt: new Date(createdAt).toISOString(), url: `https://x.com/${username}/status/${postId}`,
    media: parseMedia(raw.media), metrics: { likeCount: number(raw.likes), replyCount: number(raw.replies), repostCount: number(raw.reposts), quoteCount: number(raw.quotes) }, links: [], quote: null, reply: null,
  };
  const facets = raw.raw_text ? object(raw.raw_text).facets : undefined;
  if (facets !== undefined && !Array.isArray(facets)) return invalid();
  for (const facet of (facets ?? []) as unknown[]) {
    const link = object(facet);
    if (link.type === "url") post.links!.push({ url: webUrl(link.original), expandedUrl: webUrl(link.replacement), displayUrl: typeof link.display === "string" ? link.display : null });
  }
  if (!preview && raw.quote) {
    const quote = object(raw.quote), quoteId = id(quote.id);
    let quotedPost: XLinkedPostPreviewDto | null = null;
    if (quote.type === "status" && object(quote.author).protected === false) {
      const parsed = parseStatus(quote, true), quotedAuthor = object(quote.author);
      quotedPost = { ...parsed, name: typeof quotedAuthor.name === "string" ? quotedAuthor.name : null, profileImageUrl: quotedAuthor.avatar_url ? webUrl(quotedAuthor.avatar_url, true) : null };
    }
    post.quote = { postId: quoteId, post: quotedPost };
  }
  if (!preview && raw.replying_to) {
    const reply = object(raw.replying_to);
    post.reply = { postId: id(reply.status), conversationId: null, targetUsername: handle(reply.screen_name), post: null };
  }
  return post;
};

export function parseFxTimelinePage(payload: unknown, targetHandle: string, trustedUserId: string) {
  const body = object(payload), target = handle(targetHandle);
  if (body.code !== 200) throw new FxApiError(`fx_payload_${typeof body.code === "number" ? body.code : "invalid"}`);
  if (!Array.isArray(body.results) || body.results.length > 200) return invalid();
  const posts = new Map<string, XPostDto>();
  for (const value of body.results) {
    const raw = object(value);
    if (raw.type !== "status") continue;
    const author = object(raw.author);
    if (handle(author.screen_name) !== target || raw.reposted_by) continue;
    if (id(author.id) !== trustedUserId) throw new FxApiError("fx_identity_mismatch");
    const post = parseStatus(raw);
    if (!posts.has(post.id)) posts.set(post.id, post);
  }
  const bottom = body.cursor === undefined ? null : object(body.cursor).bottom;
  if (bottom !== null && bottom !== undefined && (typeof bottom !== "string" || bottom.length > 2048 || [...bottom].some(char => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126))) return invalid();
  return { posts: [...posts.values()], nextCursor: typeof bottom === "string" && bottom ? bottom : null, rawCount: body.results.length };
}

export function parseFxStatus(payload: unknown, targetHandle: string, trustedUserId: string, expectedPostId: string): XPostDto {
  const body = object(payload), target = handle(targetHandle), userId = id(trustedUserId), expectedId = id(expectedPostId);
  if (body.code !== 200) throw new FxApiError(`fx_payload_${typeof body.code === "number" ? body.code : "invalid"}`);
  const raw = object(body.status), author = object(raw.author);
  if (id(raw.id) !== expectedId) throw new FxApiError("fx_identity_mismatch");
  if (raw.type !== "status") return invalid();
  if (handle(author.screen_name) !== target || raw.reposted_by) throw new FxCandidateExcludedError();
  if (id(author.id) !== userId) throw new FxApiError("fx_identity_mismatch");
  return parseStatus(raw);
}

const request = async (path: string) => {
  try {
    // Workers supports manual redirects; reject 3xx before following another host.
    const response = await fetch(`https://api.fxtwitter.com${path}`, { headers: { Accept: "application/json", "User-Agent": "OTWSchedule/1.0 (+https://otw-schedule.info)" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new FxApiError(`fx_http_${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) return invalid();
    try { return object(JSON.parse(text)); } catch (error) { if (error instanceof FxApiError) throw error; return invalid(); }
  } catch (error) {
    if (error instanceof FxApiError) throw error;
    throw new FxApiError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "fx_timeout" : "fx_network_error");
  }
};
export async function fetchFxProfile(targetHandle: string) {
  const target = handle(targetHandle), body = await request(`/2/profile/${target}`);
  if (body.code !== 200) throw new FxApiError(`fx_payload_${body.code}`);
  const user = object(body.user);
  if (handle(user.screen_name) !== target || user.protected !== false) throw new FxApiError("fx_identity_mismatch");
  return { id: id(user.id), username: target };
}
export async function fetchFxTimelinePage(targetHandle: string, cursor: string | null, trustedUserId: string) {
  const target = handle(targetHandle), query = new URLSearchParams({ count: "20", with_replies: "true" });
  if (cursor) query.set("cursor", cursor);
  return parseFxTimelinePage(await request(`/2/profile/${target}/statuses?${query}`), target, id(trustedUserId));
}
export async function fetchFxStatus(postId: string, targetHandle: string, trustedUserId: string): Promise<XPostDto> {
  const expectedId = id(postId), target = handle(targetHandle), userId = id(trustedUserId);
  return parseFxStatus(await request(`/2/status/${expectedId}`), target, userId, expectedId);
}
