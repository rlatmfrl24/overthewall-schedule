// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { XActivityManager } from "./x-activity-manager";
import { fetchXActivity, startXActivity, stopXActivity, xActivityQueryKey } from "../../api/x-activity-api";
import type { XActivityStatusDto } from "@contracts/x-activity";
vi.mock("../../api/x-activity-api",()=>({xActivityQueryKey:["member-posts","x-activity"],fetchXActivity:vi.fn(),startXActivity:vi.fn(),stopXActivity:vi.fn()}));
const inactive:XActivityStatusDto={configured:true,callbackUrl:"https://app/api/x/activity/webhook",subscription:null,site:"otw",mode:"user_paused",
  budget:{limitMicros:1000000,usedMicros:20000,reservedMicros:10000,strictDailyCap:false},budgetDay:"2026-10-26",budgetReady:true,
  providerActiveCount:0,events:[],sites:[{site:"otw",enabled:false,targetCount:8,activeCount:0,failedCount:0,pauseReason:"user",resumeAt:null,lastError:null}],
  subscriptions:[],recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:1}};
const status:XActivityStatusDto={...inactive,mode:"normal",sites:[{...inactive.sites![0]!,enabled:true,activeCount:8,pauseReason:null}]};
afterEach(()=>{cleanup();vi.clearAllMocks();});
const open=async()=>{const details=(await screen.findByText("X 신규 피드 구독")).closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));};
describe("X activity whole-site controls",()=>{
  it("shows progress in the card and reveals management after activation is confirmed",async()=>{
    const otw=inactive.sites![0]!;
    const luvdia={...otw,site:"luvdia" as const,enabled:true,activeCount:3};
    vi.mocked(fetchXActivity).mockResolvedValue({...status,primarySource:"fxembed",sites:[otw,luvdia]});
    let finishActivation!: (result:XActivityStatusDto)=>void;
    vi.mocked(startXActivity).mockImplementation(()=>new Promise(resolve=>{finishActivation=resolve;}));
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    const card=screen.getByRole("region",{name:"웹훅"});
    const activate=within(card).getByRole<HTMLButtonElement>("switch",{name:"웹훅 활성화"});
    await waitFor(()=>expect(activate.disabled).toBe(false));
    expect(screen.queryByRole("region",{name:"X 웹훅 관리"})).toBeNull();
    fireEvent.click(activate);
    const confirmation=screen.getByRole("alertdialog",{name:"웹훅 활성화"});
    expect(within(confirmation).getByText(/강제 상한을 보장하지 않습니다/)).toBeTruthy();
    expect(startXActivity).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button",{name:"활성화"}));
    expect((await within(card).findByRole("status")).textContent).toContain("웹훅 활성화 중");
    expect(activate.disabled).toBe(true);
    expect(within(card).queryByRole("region",{name:"X 웹훅 관리"})).toBeNull();
    expect(startXActivity).toHaveBeenCalledExactlyOnceWith("start");
    act(()=>finishActivation({...status,primarySource:"fxembed",sites:[status.sites![0]!,luvdia]}));
    expect(await within(card).findByRole("region",{name:"X 웹훅 관리"})).toBeTruthy();
    expect(within(card).queryByText("웹훅 활성화 중")).toBeNull();
    expect(activate.getAttribute("aria-checked")).toBe("true");
  });
  it("allows a failed remote stop to be retried while local delivery is already disabled",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...inactive,mode:"partial",sites:[{...inactive.sites![0],activeCount:1,lastError:"x_activity_provider_500"}]});
    vi.mocked(stopXActivity).mockResolvedValue(inactive);
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
    const button=await screen.findByRole("button",{name:"이 사이트 웹훅 중지"});
    await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(()=>expect(stopXActivity).toHaveBeenCalledTimes(1));
    expect(startXActivity).not.toHaveBeenCalled();
  });
  it("blocks resume during transition",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,primarySource:"fxembed",pauseReason:"hybrid_transition"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
    await screen.findByText(/수집원 전환이 끝난 뒤/);
    expect((screen.getByRole("button",{name:"전체 구독 재개"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps excluded and unavailable receipts visible in the recent sample",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"normal",events:["complete","pending","failed","skipped","unavailable"].map((state,index)=>({
      postId:String(10000+index),receivedAt:Date.now(),status:state,mediaSource:"pending" as const,mediaCount:0,mediaTypes:"",error:null}))});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    expect(await screen.findByText(/처리 제외 1/)).toBeTruthy();
    expect(screen.getByText(/원문 미확보 1/)).toBeTruthy();
    expect(screen.getByText(/최근 수신 5건 기준/)).toBeTruthy();
  });
  it("hides the panel when the initial read fails without known active subscriptions",async()=>{
    vi.mocked(fetchXActivity).mockRejectedValue(new Error("offline"));
    const client=createTestQueryClient();
    render(createElement(QueryClientProvider,{client},createElement(XActivityManager)));
    await waitFor(()=>expect(client.getQueryState(xActivityQueryKey)?.status).toBe("error"));
    expect(screen.getByRole("switch",{name:"웹훅 활성화"})).toHaveProperty("disabled",true);
    expect(screen.queryByRole("region",{name:"X 웹훅 관리"})).toBeNull();
    expect(startXActivity).not.toHaveBeenCalled();
  });
  it("does not call a missing configuration normal even when an old mode says normal",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,configured:false,mode:"normal"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
    expect(await screen.findByText("웹훅 연결·인증 확인 필요")).toBeTruthy();
    expect((screen.getByRole("button",{name:"전체 구독 재개"}) as HTMLButtonElement).disabled).toBe(true);
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
    expect(await screen.findByRole("heading",{name:"웹훅 신규 게시물"})).toBeTruthy();
    expect(await screen.findByText(/신규 수신 대기/)).toBeTruthy();
    expect(fetchXActivity).toHaveBeenCalledTimes(1);
  });
  it("marks cached status as previous information after refresh failure, then recovers",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"normal"});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
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
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
    fireEvent.click(await screen.findByRole("button",{name:"전체 구독 재개"}));
    await screen.findByText(/응답 오류\(503\)/);
    await waitFor(()=>expect(fetchXActivity).toHaveBeenCalledTimes(2));
    expect(startXActivity).toHaveBeenCalledTimes(1);
  });
  it("applies server targets, reads actual counts and stops only the current site",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue(status);
    vi.mocked(startXActivity).mockResolvedValue({...status,mode:"normal",providerActiveCount:8,sites:[{...status.sites![0]!,enabled:true,activeCount:8,pauseReason:null}]});
    vi.mocked(stopXActivity).mockResolvedValue(inactive);
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    await open();
    await screen.findByRole("button",{name:"전체 구독 재개"});
    expect(screen.queryByLabelText("구독할 X 사용자 이름")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"전체 구독 재개"}));
    await waitFor(()=>expect(startXActivity).toHaveBeenCalledWith("resume"));
    expect(await screen.findByText(/구독 정상/)).toBeTruthy();
    expect(screen.getByText(/OTW · 구독 8 \/ 대상 8/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch",{name:"웹훅 활성화"}));
    await waitFor(()=>expect(stopXActivity).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.queryByRole("region",{name:"X 웹훅 관리"})).toBeNull());
    expect(screen.getByRole("switch",{name:"웹훅 활성화"}).getAttribute("aria-checked")).toBe("false");
  });
  it("shows global budget pause, partial registrations and pending enrichment without declaring completion",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue({...status,mode:"budget_paused",resumeAt:1793059200000,
      sites:[{...status.sites![0]!,enabled:true,activeCount:6,failedCount:2,pauseReason:"budget"}],
      events:[{postId:"2114516278392348991",receivedAt:Date.now(),status:"pending",mediaSource:"pending",mediaCount:0,mediaTypes:"",error:"budget_exceeded"}]});
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});await open();
    expect(await screen.findByText("보강 대기")).toBeTruthy();
    expect(screen.getByText(/양 사이트 합산 UTC 예산/)).toBeTruthy();
    expect(screen.getByText(/강제 상한을 보장하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/등록 실패 2/)).toBeTruthy();
    expect(screen.getByText(/자동 재개 예정/)).toBeTruthy();
    expect(screen.queryByText("정상")).toBeNull();
  });
});
