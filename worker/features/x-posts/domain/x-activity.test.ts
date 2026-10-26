import { describe, expect, it } from "vitest";
import { parseXActivityEvent, xActivityMediaReady, signXActivity, verifyXActivity, validXActivityChallenge } from "./x-activity";

const event = (payload: Record<string, unknown> = {}) => ({ data: {
  event_uuid: "2114516278392348991", event_type: "post.create", tag: "otw:xaa:test",
  filter: { user_id: "1607408138545950721" },
  payload: { id: "2114516278392348991", author_id: "1607408138545950721", text: "hello", created_at: "2026-10-26T00:35:41Z", ...payload },
} });

describe("X activity trust and media boundary", () => {
  it("verifies exact bytes and rejects altered bodies, signatures and CRC signing-oracle input", async () => {
    const raw = JSON.stringify(event());
    const signature = await signXActivity("secret", raw);
    expect(await verifyXActivity("secret", raw, signature)).toBe(true);
    expect(await verifyXActivity("secret", raw + " ", signature)).toBe(false);
    expect(await verifyXActivity("secret", raw, "sha256=invalid")).toBe(false);
    expect(validXActivityChallenge('{"data":{}}')).toBe(false);
    expect(validXActivityChallenge("opaque-CRC_token123==")).toBe(true);
  });

  it("requires matching author/filter and a valid post identity/date", () => {
    expect(parseXActivityEvent(event())?.post.id).toBe("2114516278392348991");
    expect(parseXActivityEvent(event({ author_id: "123456789" }))).toBeNull();
    expect(parseXActivityEvent(event({ created_at: "bad" }))).toBeNull();
    expect(parseXActivityEvent(event({ id: "../other" }))).toBeNull();
  });

  it("does not confuse missing attachments with confirmed empty or partially mapped mixed media", () => {
    expect(xActivityMediaReady(parseXActivityEvent(event())!)).toBe(false);
    expect(xActivityMediaReady(parseXActivityEvent(event({ attachments: { media_keys: [] } }))!)).toBe(true);
    const mixed = event({ attachments: { media_keys: ["photo", "video"] } });
    Object.assign(mixed.data, { includes: { media: [
      { media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" },
      { media_key: "video", type: "video", preview_image_url: "https://pbs.twimg.com/video_thumb/video.jpg" },
    ] } });
    expect(xActivityMediaReady(parseXActivityEvent(mixed)!)).toBe(true);
    (mixed.data as unknown as { includes: { media: unknown[] } }).includes.media.pop();
    expect(xActivityMediaReady(parseXActivityEvent(mixed)!)).toBe(false);
  });
});
