// @vitest-environment jsdom
import { createMemberFixture } from "@/test/member-fixtures";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
const mocks = vi.hoisted(() => ({ members: vi.fn(), ddays: vi.fn() }));
vi.mock("@/features/members", () => ({ fetchActiveMembers: mocks.members }));
vi.mock("@/features/ddays", () => ({ fetchDDays: mocks.ddays }));
beforeEach(() => { mocks.members.mockReset(); mocks.ddays.mockReset(); });
it("loads members without fetching or waiting for unused D-days", async () => {
  mocks.members.mockResolvedValue([createMemberFixture({ uid:1 })]);
  mocks.ddays.mockImplementation(() => new Promise(() => {}));
  const { useScheduleData } = await import('./use-schedule-data');
  const { result } = renderHook(() => useScheduleData(), { wrapper:createQueryWrapper() });
  await waitFor(() => expect(result.current.hasLoaded).toBe(true));
  expect(result.current.members.map(row => row.uid)).toEqual([1]);
  expect(result.current.loading).toBe(false);
  expect(mocks.ddays).not.toHaveBeenCalled();
});
it("reloads members under the current access policy", async () => {
  mocks.members.mockResolvedValueOnce([createMemberFixture({ uid:1 })]).mockResolvedValueOnce([]).mockResolvedValueOnce([createMemberFixture({ uid:2 })]);
  mocks.ddays.mockResolvedValue([]);
  const { useScheduleData } = await import('./use-schedule-data');
  const { result } = renderHook(() => useScheduleData(), { wrapper:createQueryWrapper() });
  await waitFor(() => expect(result.current.hasLoaded).toBe(true));
  await act(async () => { await result.current.reloadAll(); });
  await waitFor(() => expect(result.current.members).toEqual([]));
  await act(async () => { await result.current.reloadMembers(); });
  await waitFor(() => expect(result.current.members.map(row => row.uid)).toEqual([2]));
  expect(mocks.ddays).not.toHaveBeenCalled();
});
