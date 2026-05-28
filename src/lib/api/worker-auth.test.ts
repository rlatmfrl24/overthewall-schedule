import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateOptionalRequest,
  authenticateRequest,
  clearAuthCachesForTests,
  requireAdminUser,
} from "../../../worker/auth";
import type { Env } from "../../../worker/types";

const ISSUER = "https://test-clerk.example.com";
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const KEY_ID = "test-key";

const textEncoder = new TextEncoder();

const base64UrlEncode = (value: string | ArrayBuffer) => {
  const bytes =
    typeof value === "string"
      ? textEncoder.encode(value)
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const makeEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    YOUTUBE_API_KEY: "",
    CLERK_ISSUER: ISSUER,
    CLERK_JWKS_URL: JWKS_URL,
    CLERK_ADMIN_IDS: "user_admin",
    otw_db: {} as D1Database,
    ...overrides,
  }) as Env;

describe("worker auth", () => {
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey & { kid: string };

  beforeEach(async () => {
    clearAuthCachesForTests();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    privateKey = keyPair.privateKey;
    publicJwk = {
      ...((await crypto.subtle.exportKey(
        "jwk",
        keyPair.publicKey,
      )) as JsonWebKey),
      kid: KEY_ID,
      alg: "RS256",
      use: "sig",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          keys: [publicJwk],
        }),
      ),
    );
  });

  const signToken = async (
    payloadOverrides: Record<string, unknown> = {},
  ) => {
    const header = base64UrlEncode(
      JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" }),
    );
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: ISSUER,
        sub: "user_admin",
        sid: "session_1",
        name: "Admin User",
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...payloadOverrides,
      }),
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      textEncoder.encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64UrlEncode(signature)}`;
  };

  it("spoofed user header alone is not authenticated", async () => {
    const result = await authenticateRequest(
      new Request("https://example.com/api/settings", {
        headers: { "x-otw-user-id": "user_admin" },
      }),
      makeEnv(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("valid Clerk session token authenticates the user", async () => {
    const token = await signToken();
    const result = await authenticateRequest(
      new Request("https://example.com/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      makeEnv(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("user_admin");
      expect(result.user.displayName).toBe("Admin User");
    }
  });

  it("optional auth uses a valid Clerk token but allows anonymous requests", async () => {
    const token = await signToken({ sub: "user_member" });
    const anonymousUser = await authenticateOptionalRequest(
      new Request("https://example.com/api/schedules", {
        headers: { "x-otw-user-id": "spoofed_user" },
      }),
      makeEnv(),
    );
    const authenticatedUser = await authenticateOptionalRequest(
      new Request("https://example.com/api/schedules", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      makeEnv(),
    );

    expect(anonymousUser).toBeNull();
    expect(authenticatedUser).toMatchObject({
      id: "user_member",
      displayName: "Admin User",
    });
  });

  it("admin allowlist is enforced after token verification", async () => {
    const token = await signToken({ sub: "user_member" });
    const result = await requireAdminUser(
      new Request("https://example.com/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      makeEnv(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("missing auth configuration fails closed", async () => {
    const token = await signToken();
    const result = await authenticateRequest(
      new Request("https://example.com/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      makeEnv({ CLERK_ISSUER: undefined, CLERK_JWKS_URL: undefined }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(500);
    }
  });
});
