import { expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/api/client";
import { extractXHandleFromUrl } from "../model/x-handles";
import { fetchXPostsConfig } from "./x-posts-api";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

it("extracts X handles without treating reserved paths as accounts", () => {
  expect(extractXHandleFromUrl("https://x.com/otw_member")).toBe("otw_member");
  expect(extractXHandleFromUrl("https://twitter.com/OtwMember/status/1")).toBe("OtwMember");
  expect(extractXHandleFromUrl("@direct_handle")).toBe("direct_handle");
  expect(extractXHandleFromUrl("https://x.com/search?q=otw")).toBeNull();
  expect(extractXHandleFromUrl("https://example.com/otw_member")).toBeNull();
});

it("fetches current visibility and bypasses the HTTP cache on retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ visibility: "public" }).mockResolvedValueOnce({ visibility: "members" });
  await expect(fetchXPostsConfig()).resolves.toEqual({ visibility: "public" });
  await expect(fetchXPostsConfig({ force: true })).resolves.toEqual({ visibility: "members" });
  expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/x/config", { cache: "default" });
  expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/x/config", { cache: "no-store" });
});
