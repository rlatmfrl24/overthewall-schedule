// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { XActivityStatusDto } from "@contracts/x-activity";
import { OperationsHome } from "./operations-home";

const { fetchActivity, fetchReferences } = vi.hoisted(() => ({ fetchActivity: vi.fn(), fetchReferences: vi.fn() }));
vi.mock("@/features/operations",()=>({OperationsDashboard:({onRefresh,xWebhook,xWebhookIssue,xRestPendingSources}:{onRefresh:()=>void;xWebhook:ReactNode;xWebhookIssue?:{message:string};xRestPendingSources?:number|null})=>createElement("main",null,
  createElement("button",{onClick:onRefresh},"상태 새로고침"),xWebhook,xWebhookIssue&&createElement("p",{"data-testid":"issue"},xWebhookIssue.message),createElement("p",{"data-testid":"rest-pending"},String(xRestPendingSources)))}));
vi.mock("@/features/member-posts",async()=>({
  fetchXHistoryHealth:fetchReferences,xReferenceHealthQueryKey:["references"],
  ...await import("@/features/member-posts/queries/use-x-activity-status"),
  ...await import("@/features/member-posts/ui/admin/x-activity-status-card"),
  ...await import("@/features/member-posts/model/x-activity-monitoring"),
}));
vi.mock("@/features/member-posts/api/x-activity-api",()=>({xActivityQueryKey:["member-posts","x-activity"],fetchXActivity:fetchActivity}));
const normal:XActivityStatusDto={configured:true,site:"otw",mode:"normal",subscription:null,callbackUrl:null,
  budget:{usedMicros:60000,reservedMicros:0,limitMicros:1000000,strictDailyCap:false},budgetReady:true,events:[],providerActiveCount:8,
  sites:[{site:"otw",enabled:true,activeCount:5,targetCount:5,failedCount:0,pauseReason:null,resumeAt:null,lastError:null}]};
beforeEach(()=>{fetchActivity.mockResolvedValue(normal);fetchReferences.mockResolvedValue({referenceHydration:{pendingPosts:0,pendingAuthors:0,terminal:0}});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

it("reads and refreshes the current webhook card from the dashboard's top action",async()=>{
  render(createElement(OperationsHome),{wrapper:createQueryWrapper()});
  await screen.findByText(/신규 수신 대기/);
  expect(screen.queryByTestId("issue")).toBeNull();
  fetchActivity.mockResolvedValue({...normal,mode:"partial",sites:[{...normal.sites![0],activeCount:4,failedCount:1}]});
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  await waitFor(()=>expect(fetchActivity).toHaveBeenCalledTimes(2));
  expect(await screen.findByTestId("issue")).toHaveProperty("textContent","웹훅 일부 실패");
  expect(screen.getByText(/이 사이트 구독 4 \/ 대상 5/)).toBeTruthy();
  expect(fetchReferences).toHaveBeenCalledTimes(2);
});

it("shows dashboard lookup failure and previous values without claiming current normal",async()=>{
  render(createElement(OperationsHome),{wrapper:createQueryWrapper()});
  await screen.findByText(/신규 수신 대기/);
  fetchActivity.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  expect(await screen.findByText("최신 웹훅 상태 확인 불가")).toBeTruthy();
  expect(screen.getByText(/이전 확인/)).toBeTruthy();
  expect(screen.queryByText(/^구독 정상/)).toBeNull();
  expect(screen.getByTestId("issue").textContent).toContain("현재 웹훅 상태를 조회하지 못했습니다");
});

it("refreshes pending REST cursors and does not use stale data after a lookup failure",async()=>{
  fetchActivity.mockResolvedValue({...normal,recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:1}});
  render(createElement(OperationsHome),{wrapper:createQueryWrapper()});
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("1"));
  fetchActivity.mockResolvedValue({...normal,recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:0}});
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("0"));
  fetchActivity.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
  await waitFor(()=>expect(screen.getByTestId("rest-pending").textContent).toBe("null"));
});
