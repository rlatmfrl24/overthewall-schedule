const encoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
};

const hmac = async (
  algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512",
  secret: string,
  value: string | Uint8Array,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    typeof value === "string" ? encoder.encode(value) : value,
  );
  return new Uint8Array(signature);
};

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
};

export const deriveWebsubSecrets = async (
  rootSecret: string,
  subscriptionId: string,
  monitorGeneration: number,
) => {
  if (!rootSecret.trim()) throw new Error("WebSub root secret is not configured");
  const context = `${subscriptionId}:${monitorGeneration}`;
  const callbackToken = bytesToBase64Url(
    await hmac("SHA-256", rootSecret, `otw-play:websub:callback:${context}`),
  );
  const hubSecret = bytesToBase64Url(
    await hmac("SHA-256", rootSecret, `otw-play:websub:hub:${context}`),
  );
  return {
    callbackToken,
    callbackTokenHash: await sha256Hex(callbackToken),
    hubSecret,
  };
};

const signatureAlgorithms = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
} as const;

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export const verifyWebsubSignature = async (
  header: string | null,
  hubSecret: string,
  payload: Uint8Array,
) => {
  const match = header?.trim().match(/^(sha1|sha256|sha384|sha512)=([a-fA-F0-9]+)$/u);
  if (!match) return false;
  const algorithmName = match[1] as keyof typeof signatureAlgorithms;
  const expected = bytesToHex(
    await hmac(signatureAlgorithms[algorithmName], hubSecret, payload),
  );
  return constantTimeEqual(expected, match[2]!.toLowerCase());
};
