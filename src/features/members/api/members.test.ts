import { beforeEach, expect, it, vi } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import type { Member } from "../model/member";
import { fetchActiveMembers, fetchMemberProfile } from "./members";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
const makeMember = (overrides: Partial<Member> = {}) => (createMemberFixture({
    uid: 1,
    code: "member",
    name: "멤버",
    ...overrides
})) as Member;
it("활성 멤버만 필터링한다", async () => {
    apiFetchMock.mockResolvedValueOnce([
        makeMember({ uid: 1, is_deprecated: 0 }),
        makeMember({ uid: 2, is_deprecated: "1" }),
        makeMember({ uid: 3, is_deprecated: true }),
        makeMember({ uid: 4, is_deprecated: false }),
    ]);
    const result = await fetchActiveMembers();
    expect(result.map((member) => member.uid)).toEqual([1, 4]);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/members");
});
it("멤버 프로필 상세 API는 code를 인코딩해 요청한다", async () => {
    apiFetchMock.mockResolvedValueOnce({
        ...makeMember({ code: "member code" }),
        profileImages: [],
        backgroundImages: [],
        links: [],
    });
    await fetchMemberProfile("member code");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/members/member%20code", { cache: "no-store" });
});
