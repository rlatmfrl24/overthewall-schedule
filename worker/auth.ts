import type { Env } from "./types";

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtPayload = Record<string, unknown> & {
  aud?: unknown;
  exp?: unknown;
  iss?: unknown;
  nbf?: unknown;
  sid?: unknown;
  sub?: unknown;
};

type JwksResponse = {
  keys?: Array<JsonWebKey & { kid?: string }>;
};

export type AuthenticatedUser = {
  id: string;
  displayName: string | null;
  sessionId: string | null;
  claims: JwtPayload;
};

type AuthGuardResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

type VerifyTokenResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "missing_config" | "invalid" };

const JWKS_CACHE_TTL_MS = 10 * 60_000;
const JWT_CLOCK_SKEW_SECONDS = 60;
const CLERK_JWKS_SUFFIX = "/.well-known/jwks.json";

const jwksCache = new Map<
  string,
  {
    fetchedAt: number;
    keys: NonNullable<JwksResponse["keys"]>;
  }
>();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const getStringClaim = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getNumericClaim = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeIssuer = (value: string | null | undefined) =>
  value?.trim().replace(/\/+$/, "") || null;

const parseHttpsUrl = (value: string | null | undefined) => {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const inferIssuerFromJwksUrl = (jwksUrl: URL | null) => {
  if (!jwksUrl || !jwksUrl.pathname.endsWith(CLERK_JWKS_SUFFIX)) {
    return null;
  }
  const issuerPath = jwksUrl.pathname.slice(0, -CLERK_JWKS_SUFFIX.length);
  return normalizeIssuer(`${jwksUrl.origin}${issuerPath}`);
};

const getAuthConfig = (env: Env) => {
  const configuredIssuer = normalizeIssuer(env.CLERK_ISSUER);
  const configuredJwksUrl = parseHttpsUrl(env.CLERK_JWKS_URL);
  const issuer = configuredIssuer ?? inferIssuerFromJwksUrl(configuredJwksUrl);
  const jwksUrl =
    configuredJwksUrl ??
    (issuer ? parseHttpsUrl(`${issuer}${CLERK_JWKS_SUFFIX}`) : null);
  const audience = getStringClaim(env.CLERK_JWT_AUDIENCE);

  if (!jwksUrl || !issuer) {
    return null;
  }

  return {
    jwksUrl: jwksUrl.toString(),
    issuer,
    audience,
  };
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const base64UrlToBytes = (value: string) => {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const decodeJwtPart = <T>(value: string): T | null => {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
  } catch {
    return null;
  }
};

const parseToken = (token: string) => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const header = decodeJwtPart<JwtHeader>(encodedHeader);
  const payload = decodeJwtPart<JwtPayload>(encodedPayload);
  if (!header || !payload) return null;

  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
    header,
    payload,
  };
};

const fetchJwks = async (jwksUrl: string) => {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  const response = await fetch(jwksUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Clerk JWKS: ${response.status}`);
  }

  const data = (await response.json()) as JwksResponse;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache.set(jwksUrl, {
    fetchedAt: Date.now(),
    keys,
  });
  return keys;
};

const importVerificationKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

const verifyAudience = (claim: unknown, expectedAudience: string | null) => {
  if (!expectedAudience) return true;
  if (typeof claim === "string") return claim === expectedAudience;
  if (Array.isArray(claim)) return claim.includes(expectedAudience);
  return false;
};

const getDisplayName = (payload: JwtPayload) =>
  getStringClaim(payload.name) ??
  getStringClaim(payload.full_name) ??
  getStringClaim(payload.username) ??
  getStringClaim(payload.email) ??
  null;

const verifyClerkToken = async (
  token: string,
  env: Env,
): Promise<VerifyTokenResult> => {
  const config = getAuthConfig(env);
  if (!config) return { ok: false, reason: "missing_config" };

  const parsed = parseToken(token);
  if (!parsed) return { ok: false, reason: "invalid" };

  const kid = getStringClaim(parsed.header.kid);
  if (parsed.header.alg !== "RS256" || !kid) {
    return { ok: false, reason: "invalid" };
  }

  const issuer = getStringClaim(parsed.payload.iss);
  const subject = getStringClaim(parsed.payload.sub);
  const expiresAt = getNumericClaim(parsed.payload.exp);
  const notBefore = getNumericClaim(parsed.payload.nbf);
  const currentTime = nowSeconds();

  if (
    issuer !== config.issuer ||
    !subject ||
    !expiresAt ||
    expiresAt <= currentTime - JWT_CLOCK_SKEW_SECONDS ||
    (notBefore !== null && notBefore > currentTime + JWT_CLOCK_SKEW_SECONDS) ||
    !verifyAudience(parsed.payload.aud, config.audience)
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const keys = await fetchJwks(config.jwksUrl);
    const jwk = keys.find((key) => key.kid === kid);
    if (!jwk) return { ok: false, reason: "invalid" };

    const key = await importVerificationKey(jwk);
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(parsed.encodedSignature),
      new TextEncoder().encode(
        `${parsed.encodedHeader}.${parsed.encodedPayload}`,
      ),
    );
    if (!verified) return { ok: false, reason: "invalid" };

    return {
      ok: true,
      user: {
        id: subject,
        displayName: getDisplayName(parsed.payload),
        sessionId: getStringClaim(parsed.payload.sid),
        claims: parsed.payload,
      },
    };
  } catch (error) {
    console.error("Failed to verify Clerk token", error);
    return { ok: false, reason: "invalid" };
  }
};

const authenticationNotConfigured = () =>
  new Response("Authentication is not configured", { status: 500 });

const loginRequired = () => new Response("Login required", { status: 401 });

const adminRequired = () =>
  new Response("Admin permission required", { status: 403 });

export const authenticateRequest = async (
  request: Request,
  env: Env,
): Promise<AuthGuardResult> => {
  const token = getBearerToken(request);
  if (!token) return { ok: false, response: loginRequired() };

  const result = await verifyClerkToken(token, env);
  if (!result.ok) {
    return {
      ok: false,
      response:
        result.reason === "missing_config"
          ? authenticationNotConfigured()
          : loginRequired(),
    };
  }

  return result;
};

export const authenticateOptionalRequest = async (
  request: Request,
  env: Env,
): Promise<AuthenticatedUser | null> => {
  const token = getBearerToken(request);
  if (!token) return null;

  const result = await verifyClerkToken(token, env);
  return result.ok ? result.user : null;
};

export const isAdminUser = (env: Env, userId: string) => {
  const adminIds = (env.CLERK_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
};

export const requireAdminUser = async (
  request: Request,
  env: Env,
): Promise<AuthGuardResult> => {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return auth;
  if (!isAdminUser(env, auth.user.id)) {
    return { ok: false, response: adminRequired() };
  }
  return auth;
};

export const clearAuthCachesForTests = () => {
  jwksCache.clear();
};
