// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { XActivityStatusDto } from "@contracts/x-activity";
import { OperationsHome } from "./operations-home";

const { fetchActivity, fetchReferences } = vi.hoisted(() => ({ fetchActivity: vi.fn(), fetchReferences: vi.fn() }));
vi.mock("@/features/operations",()=>({OperationsDashboard:({onRefresh,xRestPendingSources,referenceBacklog}:{onRefresh:()=>void;xRestPendingSources?:number|null;referenceBacklog?:ReactNode})=>createElement("main",null,
  createElement("button",{onClick:onRefresh},"상태 새로고침"),referenceBacklog,createElement("p",{"data-testid":"rest-pending"},String(xRestPendingSources)))}));
vi.mock("@/features/member-posts",async()=>({
  fetchXHistoryHealth:fetchReferences,xReferenceHealthQueryKey:["references"],
  ...await import("@/features/member-posts/queries/use-x-activity-status"),
}));
vi.mock("@/features/member-posts/api/x-activity-api",()=>({xActivityQueryKey:["member-posts","x-activity"],fetchXActivity:fetchActivity}));
const normal:XActivityStatusDto={configured:true,site:"otw",mode:"normal",subscription:null,callbackUrl:null,
  budget:{usedMicros:60000,reservedMicros:0,limitMicros:1000000,strictDailyCap:false},budgetReady:true,events:[],providerActiveCount:8,
  sites:[{site:"otw",enabled:true,activeCount:5,targetCount:5,failedCount:0,pauseReason:null,resumeAt:null,lastError:null}]};
beforeEach(()=>{fetchActivity.mockResolvedValue(normal);fetchReferences.mockResolvedValue({referenceHydration:{pendingPosts:0,pendingAuthors:0,terminal:0}});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

it("refreshes pending REST cursors and does not use stale data after a lookup failure",async()=>{
  fetchActivity.mockResolvedValue({...normal,recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:1}});
  render(createElement(OperationsHome),{wrapper:createQueryWrapper()});
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("1"));
  expect(screen.queryByText(/웹훅|신규 수신 대기/)).toBeNull();
  fetchActivity.mockResolvedValue({...normal,recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:0}});
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("0"));
  fetchActivity.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("null"));
  expect(screen.queryByText(/웹훅/)).toBeNull();
  expect(fetchReferences).toHaveBeenCalledTimes(3);
});
