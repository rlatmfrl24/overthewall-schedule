import type { XPostDto } from "@contracts/x-posts";

export type XPostOrigin = "fxembed" | "x_api" | "webhook";
export type XPostAuthority = Record<"text" | "media" | "relations", XPostOrigin>;
export type XPostWriteContext = {
  origin: XPostOrigin;
  completeness: Record<keyof XPostAuthority, boolean>;
};
export const officialXPostContext: XPostWriteContext = {
  origin: "x_api", completeness: { text: true, media: true, relations: true },
};
const priority: Record<XPostOrigin, number> = { fxembed: 1, webhook: 2, x_api: 3 };
export const xPostContentKey = (post: XPostDto) => JSON.stringify([
  post.id, post.username, post.createdAt, post.url, post.text, post.media,
  post.links ?? [], post.quote ?? null, post.reply ?? null,
], (key, value) => key === "metrics" ? undefined : value);

export const hasStoredXPostChanged = (
  existing: { post: XPostDto; authority: XPostAuthority | null } | null,
  post: XPostDto,
  authority: XPostAuthority,
) => !existing || xPostContentKey(post) !== xPostContentKey(existing.post)
  || JSON.stringify(authority) !== JSON.stringify(existing.authority ?? { text: "x_api", media: "x_api", relations: "x_api" })
  || JSON.stringify(post.metrics) !== JSON.stringify(existing.post.metrics);

export function mergeStoredXPost(
  existing: { post: XPostDto; authority: XPostAuthority | null } | null,
  incoming: XPostDto,
  context: XPostWriteContext,
) {
  const authority: XPostAuthority = existing?.authority
    ? { ...existing.authority }
    : { text: existing ? "x_api" : context.completeness.text ? context.origin : "fxembed", media: existing ? "x_api" : context.completeness.media ? context.origin : "fxembed", relations: existing ? "x_api" : context.completeness.relations ? context.origin : "fxembed" };
  const post: XPostDto = existing ? { ...existing.post } : { ...incoming };
  for (const field of ["text", "media", "relations"] as const) {
    if (!context.completeness[field] || (existing && priority[context.origin] < priority[authority[field]])) continue;
    authority[field] = context.origin;
    if (field === "text") { post.text = incoming.text; post.links = incoming.links; }
    if (field === "media") post.media = incoming.media;
    if (field === "relations") {
      // Fx omissions are incomplete evidence even when the coarse relation flag is complete.
      post.quote = context.origin === "fxembed" && existing ? incoming.quote ?? existing.post.quote : incoming.quote;
      post.reply = context.origin === "fxembed" && existing ? incoming.reply ?? existing.post.reply : incoming.reply;
      if (post.reply && existing?.post.reply?.postId === post.reply.postId) post.reply = { ...existing.post.reply, ...Object.fromEntries(Object.entries(post.reply).filter(([, value]) => value !== null && value !== undefined)), postId: post.reply.postId, post: post.reply.post };
      for (const relation of ["quote", "reply"] as const) {
        const next = post[relation];
        const previous = existing?.post[relation];
        if (next && (!next.post || context.origin === "fxembed") && previous?.postId === next.postId && previous.post?.id === next.postId) {
          if (relation === "quote" && post.quote) post.quote = { ...post.quote, post: previous.post };
          if (relation === "reply" && post.reply) post.reply = { ...post.reply, post: previous.post };
        }
      }
    }
  }
  if (existing && context.origin === "x_api" && !context.completeness.relations) {
    // A recovered preview fills only an already-known relation, without confirming other fields.
    for (const relation of ["quote", "reply"] as const) {
      const current = post[relation], next = incoming[relation];
      if (current && !current.post && current.postId === next?.postId && next.post?.id === current.postId) {
        if (relation === "quote" && post.quote) post.quote = { ...post.quote, post: next.post };
        if (relation === "reply" && post.reply) post.reply = { ...post.reply, post: next.post };
      }
    }
  }
  if (context.origin !== "fxembed" || !existing) post.metrics = incoming.metrics;
  return { post, authority, changed: hasStoredXPostChanged(existing, post, authority) };
}
