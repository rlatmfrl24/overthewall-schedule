import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createAuthStatusHandler } from "./handler";

const authenticateOptionalRequestMock = vi.hoisted(() => vi.fn());
const isAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  authenticateOptionalRequest: authenticateOptionalRequestMock,
  isAdminUser: isAdminUserMock,
}));

const handler = createAuthStatusHandler();
const env = {} as Env;

describe("auth status handler", () => {
  beforeEach(() => {
    authenticateOptionalRequestMock.mockReset();
    isAdminUserMock.mockReset();
  });

  it("returns the Worker-authoritative admin decision without exposing a user id", async () => {
    authenticateOptionalRequestMock.mockResolvedValue({ id: "user_admin" });
    isAdminUserMock.mockReturnValue(true);

    const response = await handler(
      new Request("https://example.com/api/auth/admin-status"),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
    expect(await response.json()).toEqual({ authenticated: true, isAdmin: true });
    expect(isAdminUserMock).toHaveBeenCalledWith(env, "user_admin");
  });

  it("returns a neutral signed-out decision", async () => {
    authenticateOptionalRequestMock.mockResolvedValue(null);

    const response = await handler(
      new Request("https://example.com/api/auth/admin-status"),
      env,
    );

    expect(await response.json()).toEqual({ authenticated: false, isAdmin: false });
    expect(isAdminUserMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods", async () => {
    const response = await handler(
      new Request("https://example.com/api/auth/admin-status", { method: "POST" }),
      env,
    );

    expect(response.status).toBe(405);
  });
});
