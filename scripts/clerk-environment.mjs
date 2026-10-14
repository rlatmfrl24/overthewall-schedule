const CLERK_DEVELOPMENT_PUBLISHABLE_KEY_PATTERN =
  /^pk_test_[A-Za-z0-9_=-]{10,}$/;
const CLERK_PRODUCTION_PUBLISHABLE_KEY_PATTERN =
  /^pk_live_[A-Za-z0-9_=-]{10,}$/;

export const CLERK_ENVIRONMENT_TARGETS = {
  development: "development",
  production: "production",
};

export const getClerkPublishableKeyKind = (value) => {
  const normalized = value?.trim() ?? "";
  if (CLERK_DEVELOPMENT_PUBLISHABLE_KEY_PATTERN.test(normalized)) {
    return CLERK_ENVIRONMENT_TARGETS.development;
  }
  if (CLERK_PRODUCTION_PUBLISHABLE_KEY_PATTERN.test(normalized)) {
    return CLERK_ENVIRONMENT_TARGETS.production;
  }
  return "invalid";
};

export const resolveClerkEnvironmentTarget = ({
  command,
  mode,
  isPreview = false,
}) => {
  if (mode === "test") return null;
  if (command === "serve" && !isPreview) {
    return CLERK_ENVIRONMENT_TARGETS.development;
  }
  return CLERK_ENVIRONMENT_TARGETS.production;
};

export const assertClerkPublishableKeyForTarget = ({
  publishableKey,
  target,
  source = "VITE_CLERK_PUBLISHABLE_KEY",
}) => {
  const normalized = publishableKey?.trim() ?? "";
  if (!normalized) {
    throw new Error(
      `Missing ${source}. Local development requires a pk_test key and production builds require a pk_live key.`,
    );
  }

  const kind = getClerkPublishableKeyKind(normalized);
  if (kind === "invalid") {
    throw new Error(
      `Invalid ${source}. Expected a complete Clerk pk_test or pk_live publishable key.`,
    );
  }
  if (kind !== target) {
    const expectedPrefix = target === "development" ? "pk_test" : "pk_live";
    const actualPrefix = kind === "development" ? "pk_test" : "pk_live";
    throw new Error(
      `${source} uses ${actualPrefix}, but this ${target} process requires ${expectedPrefix}. Keep local and production Clerk environments separate.`,
    );
  }

  return { kind, target };
};

export const assertClerkSiteIdentity = ({ publishableKey, issuer, target }) => {
  assertClerkPublishableKeyForTarget({ publishableKey, target });
  if (!issuer) throw new Error("Missing site-scoped CLERK_ISSUER for Clerk app identity verification.");
  let expected;
  let actual;
  try {
    expected = new URL(issuer);
    const decoded = atob(publishableKey.trim().slice(8));
    if (!decoded.endsWith("$")) throw new Error("Invalid encoded key");
    actual = new URL(`https://${decoded.slice(0, -1)}`);
    if (expected.protocol !== "https:" || expected.origin !== actual.origin || expected.pathname !== "/" || expected.search || expected.hash || expected.username || expected.password || actual.pathname !== "/") throw new Error("Identity mismatch");
  } catch {
    throw new Error("Clerk publishable key app identity does not match the selected site's CLERK_ISSUER.");
  }
  return expected.origin;
};

export const assertClerkDeploymentConfig = (environment, publicOrigin) => {
  const issuer = assertClerkSiteIdentity({ publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY, issuer: environment.CLERK_ISSUER, target: "production" });
  const jwks = environment.CLERK_JWKS_URL || `${issuer}/.well-known/jwks.json`;
  if (jwks !== `${issuer}/.well-known/jwks.json`) throw new Error("Production Clerk JWKS does not match the selected app identity.");
  const parties = environment.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  if (parties.length !== 1 || parties[0] !== publicOrigin) throw new Error("Production Clerk authorized parties must exactly match the selected public origin.");
  return issuer;
};
