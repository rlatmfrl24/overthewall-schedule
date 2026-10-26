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
  it("applies server targets, reads actual counts and stops only the current site",async()=>{
    vi.mocked(fetchXActivity).mockResolvedValue(status);
    vi.mocked(startXActivity).mockResolvedValue({...status,mode:"normal",providerActiveCount:8,sites:[{...status.sites![0]!,enabled:true,activeCount:8,pauseReason:null}]});
    vi.mocked(stopXActivity).mockResolvedValue(status);
    render(createElement(XActivityManager),{wrapper:createQueryWrapper()});
    expect(fetchXActivity).not.toHaveBeenCalled();open();
    await screen.findByRole("button",{name:"전체 대상 적용"});
    expect(screen.queryByLabelText("구독할 X 사용자 이름")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"전체 대상 적용"}));
    await waitFor(()=>expect(startXActivity).toHaveBeenCalledWith("start"));
    expect(await screen.findByText("정상")).toBeTruthy();
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
    expect(screen.getByText(/양 사이트 합산 추정/)).toBeTruthy();
    expect(screen.getByText(/강제 상한을 보장하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/등록 실패 2/)).toBeTruthy();
    expect(screen.getByText(/자동 재개 예정/)).toBeTruthy();
    expect(screen.queryByText("정상")).toBeNull();
  });
});
