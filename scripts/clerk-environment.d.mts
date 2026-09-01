export type ClerkEnvironmentTarget = "development" | "production";

export const CLERK_ENVIRONMENT_TARGETS: {
  development: "development";
  production: "production";
};

export function getClerkPublishableKeyKind(
  value: string | null | undefined,
): ClerkEnvironmentTarget | "invalid";

export function resolveClerkEnvironmentTarget(input: {
  command: "build" | "serve";
  mode: string;
  isPreview?: boolean;
}): ClerkEnvironmentTarget | null;

export function assertClerkPublishableKeyForTarget(input: {
  publishableKey: string | null | undefined;
  target: ClerkEnvironmentTarget;
  source?: string;
}): { kind: ClerkEnvironmentTarget; target: ClerkEnvironmentTarget };
