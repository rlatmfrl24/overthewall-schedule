import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminStatus } from "./auth";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));

describe("auth api", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("reads the authoritative admin status with required auth and no cache", async () => {
    apiFetchMock.mockResolvedValue({ authenticated: true, isAdmin: true });

    await fetchAdminStatus();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/admin-status", {
      auth: "required",
      cache: "no-store",
    });
  });
});
