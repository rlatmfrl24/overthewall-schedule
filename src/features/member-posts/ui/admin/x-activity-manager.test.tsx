// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { XActivityManager } from "./x-activity-manager";
import { fetchXActivity, startXActivity, stopXActivity } from "../../api/x-activity-api";
import type { XActivityStatusDto } from "@contracts/x-activity";
vi.mock("../../api/x-activity-api",()=>({xActivityQueryKey:["member-posts","x-activity"],fetchXActivity:vi.fn(),startXActivity:vi.fn(),stopXActivity:vi.fn()}));
const status:XActivityStatusDto={configured:true,callbackUrl:"https://app/api/x/activity/webhook",subscription:null,site:"otw",mode:"user_paused",
  budget:{limitMicros:1000000,usedMicros:20000,reservedMicros:10000,strictDailyCap:false},budgetDay:"2026-10-26",budgetReady:true,
  providerActiveCount:0,events:[],sites:[{site:"otw",enabled:false,targetCount:8,activeCount:0,failedCount:0,pauseReason:"user",resumeAt:null,lastError:null}],
  subscriptions:[],recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:1}};
afterEach(()=>{cleanup();vi.clearAllMocks();});
const open=()=>{const details=screen.getByText("X 신규 피드 구독").closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));};
describe("X activity whole-site controls",()=>{
  it("keeps excluded and unavailable receipts visible in the recent sample",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"normal",events:["complete","pending","failed","skipped","unavailable"].map((state,index)=>({
      postId:String(10000+index),receivedAt:Date.now(),status:state,mediaSource:"pending" as const,mediaCount:0,mediaTypes:"",error:null}))});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    expect(await screen.findByText(/처리 제외 1/)).toBeTruthy();
    expect(screen.getByText(/원문 미확보 1/)).toBeTruthy();
    expect(screen.getByText(/최근 수신 5건 기준/)).toBeTruthy();
  });
  it("shows an initial lookup failure without a normal state or actionable controls",async()=>{
    vi.mocked(fetchXActivity).mockRejectedValue(new Error("offline"));
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});open();
    expect(await screen.findByText("최신 웹훅 상태 확인 불가")).toBeTruthy();
    expect(screen.queryByText(/^구독 정상/)).toBeNull();
    expect(screen.queryByRole("button",{name:"전체 대상 적용"})).toBeNull();
    expect(startXActivity).not.toHaveBeenCalled();
  });
  it("does not call a missing configuration normal even when an old mode says normal",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,configured:false,mode:"normal"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});open();
    expect(await screen.findByText("웹훅 연결·인증 확인 필요")).toBeTruthy();
    expect((screen.getByRole("button",{name:"전체 대상 적용"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/^구독 정상/)).toBeNull();
  });
  it("exposes coordinator inventory errors before opening controls",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"partial",coordinatorError:"x_activity_inventory_incomplete"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    expect(await screen.findByText(/X의 전체 구독 목록을 확인하지 못해/)).toBeTruthy();
    expect(screen.getByText("웹훅 일부 실패")).toBeTruthy();
    expect(startXActivity).not.toHaveBeenCalled();
  });
  it("reads current webhook status before opening subscription controls",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"normal"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    expect(screen.getByRole("heading",{name:"웹훅 신규 게시물"})).toBeTruthy();
    expect(await screen.findByText(/신규 수신 대기/)).toBeTruthy();
    expect(fetchXActivity).toHaveBeenCalledTimes(1);
  });
  it("marks cached status as previous information after refresh failure, then recovers",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"normal"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});open();
    await screen.findByText(/정상/);
    vi.mocked(fetchXActivity).mockRejectedValueOnce(new Error("upstream_unavailable"));
    fireEvent.click(screen.getByRole("button",{name:/상태 새로고침/}));
    expect(await screen.findByText("최신 웹훅 상태 확인 불가")).toBeTruthy();
    expect(screen.getByText(/이전 확인/)).toBeTruthy();
    expect(screen.queryByText(/^구독 정상/)).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:/상태 새로고침/}));
    await waitFor(()=>expect(screen.queryByText("최신 웹훅 상태 확인 불가")).toBeNull());
    expect(screen.getByText(/신규 수신 대기/)).toBeTruthy();
  });
  it("rereads actual state after a failed control request without retrying the mutation",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue(status);
    vi.mocked(startXActivity).mockRejectedValue(new Error("x_activity_provider_503"));
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});open();
    fireEvent.click(await screen.findByRole("button",{name:"전체 대상 적용"}));
    await screen.findByText(/응답 오류\(503\)/);
    await waitFor(()=>expect(fetchXActivity).toHaveBeenCalledTimes(2));
    expect(startXActivity).toHaveBeenCalledTimes(1);
  });
  it("applies server targets, reads actual counts and stops only the current site",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue(status);
    vi.mocked(startXActivity).mockResolvedValue({...status,mode:"normal",providerActiveCount:8,sites:[{...status.sites![0]!,enabled:true,activeCount:8,pauseReason:null}]});
    vi.mocked(stopXActivity).mockResolvedValue(status);
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    open();
    await screen.findByRole("button",{name:"전체 대상 적용"});
    expect(screen.queryByLabelText("구독할 X 사용자 이름")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"전체 대상 적용"}));
    await waitFor(()=>expect(startXActivity).toHaveBeenCalledWith("start"));
    expect(await screen.findByText(/구독 정상/)).toBeTruthy();
    expect(screen.getByText(/OTW · 구독 8 \/ 대상 8/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"이 사이트 웹훅 중지"}));
    await waitFor(()=>expect(stopXActivity).toHaveBeenCalledTimes(1));
  });
  it("shows global budget pause, partial registrations and pending enrichment without declaring completion",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"budget_paused",resumeAt:1793059200000,
      sites:[{...status.sites![0]!,enabled:true,activeCount:6,failedCount:2,pauseReason:"budget"}],
      events:[{postId:"2114516278392348991",receivedAt:Date.now(),status:"pending",mediaSource:"pending",mediaCount:0,mediaTypes:"",error:"budget_exceeded"}]});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});open();
    expect(await screen.findByText("보강 대기")).toBeTruthy();
    expect(screen.getByText(/양 사이트 합산 UTC 예산/)).toBeTruthy();
    expect(screen.getByText(/강제 상한을 보장하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/등록 실패 2/)).toBeTruthy();
    expect(screen.getByText(/자동 재개 예정/)).toBeTruthy();
    expect(screen.queryByText("정상")).toBeNull();
  });
});
