const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const numericId = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{4,24}$/.test(value);

export interface XActivityEvent {
  eventId: string;
  tag: string;
  userId: string;
  post: Record<string, unknown> & { id: string; author_id: string; text?: string; created_at: string };
  includes: { media?: Array<Record<string, unknown>> };
}

export function parseXActivityEvent(value: unknown): XActivityEvent | null {
  if (!record(value) || !record(value.data)) return null;
  const event = value.data;
  if (event.event_type !== "post.create" || typeof event.event_uuid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(event.event_uuid) || typeof event.tag !== "string" ||
    !/^[A-Za-z0-9_:-]{1,100}$/.test(event.tag) || !record(event.filter) || !numericId(event.filter.user_id) ||
    !record(event.payload)) return null;
  const post = event.payload;
  if (!numericId(post.id) || post.author_id !== event.filter.user_id || typeof post.created_at !== "string" ||
    !Number.isFinite(Date.parse(post.created_at)) || (post.text !== undefined && typeof post.text !== "string")) return null;
  if (post.note_tweet !== undefined && (!record(post.note_tweet) || typeof post.note_tweet.text !== "string")) return null;
  if (post.attachments !== undefined && (!record(post.attachments) ||
    (post.attachments.media_keys !== undefined && (!Array.isArray(post.attachments.media_keys) || !post.attachments.media_keys.every(key => typeof key === "string"))))) return null;
  if (post.referenced_tweets !== undefined && (!Array.isArray(post.referenced_tweets) || !post.referenced_tweets.every(ref => record(ref) && numericId(ref.id)))) return null;
  for (const entities of [post.entities, record(post.note_tweet) ? post.note_tweet.entities : undefined]) {
    if (entities !== undefined && (!record(entities) || (entities.urls !== undefined &&
      (!Array.isArray(entities.urls) || !entities.urls.every(item => record(item) && typeof item.url === "string"))))) return null;
  }
  const media = record(event.includes) && Array.isArray(event.includes.media)
    ? event.includes.media.filter(item => record(item) && typeof item.media_key === "string") as Array<Record<string, unknown>> : undefined;
  return { eventId: `${event.tag}:${event.event_uuid}`, tag: event.tag, userId: event.filter.user_id,
    post: post as XActivityEvent["post"], includes: { media } };
}

const mediaUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.endsWith(".twimg.com");
  } catch { return false; }
};

// The current feed displays a video poster and opens X; native playback is separate.
export function xActivityMediaReady(event: XActivityEvent): boolean {
  const attachments = event.post.attachments;
  if (!record(attachments) || !Array.isArray(attachments.media_keys)) return false;
  return attachments.media_keys.every(key => {
    const media = event.includes.media?.find(item => item.media_key === key);
    return media?.type === "photo" ? mediaUrl(media.url)
      : (media?.type === "video" || media?.type === "animated_gif") && mediaUrl(media.preview_image_url);
  });
}

export const validXActivityChallenge = (value: string) => /^[A-Za-z0-9_+/=-]{1,256}$/.test(value);

const signingKey = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export async function signXActivity(secret: string, body: string) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret, "sign"), new TextEncoder().encode(body)));
  return `sha256=${btoa(String.fromCharCode(...bytes))}`;
}

export async function verifyXActivity(secret: string, body: string, signature: string | null) {
  if (!signature || !/^sha256=[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const bytes = Uint8Array.from(atob(signature.slice(7)), character => character.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await signingKey(secret, "verify"), bytes, new TextEncoder().encode(body));
}
