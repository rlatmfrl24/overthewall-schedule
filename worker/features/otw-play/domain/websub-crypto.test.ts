import { describe, expect, it } from "vitest";
import {
  deriveWebsubSecrets,
  sha256Hex,
  verifyWebsubSignature,
} from "./websub-crypto";

const encoder = new TextEncoder();

const signature = async (secret: string, payload: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

describe("WebSub key derivation", () => {
  it("uses separated callback and hub contexts and stores a callback hash", async () => {
    const material = await deriveWebsubSecrets("root-secret", "subscription-1", 2);

    expect(material.callbackToken).toHaveLength(43);
    expect(material.hubSecret).toHaveLength(43);
    expect(material.callbackToken).not.toBe(material.hubSecret);
    expect(material.callbackTokenHash).toBe(await sha256Hex(material.callbackToken));
    await expect(
      deriveWebsubSecrets("root-secret", "subscription-1", 3),
    ).resolves.not.toEqual(material);
  });

  it("accepts the declared HMAC algorithm and rejects a modified payload", async () => {
    const payload = encoder.encode("<feed />");
    const digest = await signature("hub-secret", payload);

    await expect(
      verifyWebsubSignature(`sha256=${digest}`, "hub-secret", payload),
    ).resolves.toBe(true);
    await expect(
      verifyWebsubSignature(`sha256=${digest}`, "hub-secret", encoder.encode("changed")),
    ).resolves.toBe(false);
  });
});
