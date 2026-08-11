const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const bytesToBinary = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
};

const binaryToBytes = (binary: string) => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const encodeUtf8Base64Url = (value: string) =>
  btoa(bytesToBinary(new TextEncoder().encode(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const decodeUtf8Base64Url = (value: string) => {
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new Error("Invalid base64url value");
  }

  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (padded.length % 4)) % 4;
  const decoded = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(
    binaryToBytes(atob(`${padded}${"=".repeat(paddingLength)}`)),
  );

  if (encodeUtf8Base64Url(decoded) !== value) {
    throw new Error("Non-canonical base64url value");
  }
  return decoded;
};
