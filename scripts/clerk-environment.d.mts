export type ClerkEnvironmentTarget = "development" | "production";
export function assertClerkDeploymentConfig(environment: Record<string, string | undefined>, publicOrigin: string): string;
export function assertClerkSiteIdentity(input: {
  publishableKey: string | null | undefined;
  issuer: string | null | undefined;
  target: ClerkEnvironmentTarget;
}): string;

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
