const CLERK_DEVELOPMENT_PUBLISHABLE_KEY_PATTERN =
  /^pk_test_[A-Za-z0-9_-]{10,}$/;
const CLERK_PRODUCTION_PUBLISHABLE_KEY_PATTERN =
  /^pk_live_[A-Za-z0-9_-]{10,}$/;

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
