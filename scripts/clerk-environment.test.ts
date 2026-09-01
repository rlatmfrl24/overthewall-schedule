import { describe, expect, it } from "vitest";
import {
  assertClerkPublishableKeyForTarget,
  getClerkPublishableKeyKind,
  resolveClerkEnvironmentTarget,
} from "./clerk-environment.mjs";

const developmentKey = "pk_test_example_publishable_key_123";
const productionKey = "pk_live_example_publishable_key_123";

describe("Clerk environment contract", () => {
  it("classifies development and production publishable keys", () => {
    expect(getClerkPublishableKeyKind(developmentKey)).toBe("development");
    expect(getClerkPublishableKeyKind(productionKey)).toBe("production");
    expect(getClerkPublishableKeyKind("replace-me")).toBe("invalid");
  });

  it("uses development only for the local dev server", () => {
    expect(
      resolveClerkEnvironmentTarget({ command: "serve", mode: "development" }),
    ).toBe("development");
    expect(
      resolveClerkEnvironmentTarget({
        command: "serve",
        mode: "production",
        isPreview: true,
      }),
    ).toBe("production");
    expect(
      resolveClerkEnvironmentTarget({ command: "build", mode: "production" }),
    ).toBe("production");
    expect(
      resolveClerkEnvironmentTarget({ command: "serve", mode: "test" }),
    ).toBeNull();
  });

  it("accepts the key that belongs to the requested environment", () => {
    expect(
      assertClerkPublishableKeyForTarget({
        publishableKey: developmentKey,
        target: "development",
      }),
    ).toEqual({ kind: "development", target: "development" });
    expect(
      assertClerkPublishableKeyForTarget({
        publishableKey: productionKey,
        target: "production",
      }),
    ).toEqual({ kind: "production", target: "production" });
  });

  it.each([
    [developmentKey, "production", /uses pk_test.*requires pk_live/],
    [productionKey, "development", /uses pk_live.*requires pk_test/],
  ] as const)(
    "blocks %s from the %s environment",
    (publishableKey, target, message) => {
      expect(() =>
        assertClerkPublishableKeyForTarget({ publishableKey, target }),
      ).toThrow(message);
    },
  );

  it("rejects missing and malformed keys", () => {
    expect(() =>
      assertClerkPublishableKeyForTarget({
        publishableKey: "",
        target: "development",
      }),
    ).toThrow(/Missing VITE_CLERK_PUBLISHABLE_KEY/);
    expect(() =>
      assertClerkPublishableKeyForTarget({
        publishableKey: "pk_test_short",
        target: "development",
      }),
    ).toThrow(/Invalid VITE_CLERK_PUBLISHABLE_KEY/);
  });
});
