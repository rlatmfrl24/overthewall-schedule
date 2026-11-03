// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { XCollectionStatusDto } from "@contracts/x-collection";
import type { OperationsStatusResponse } from "@/features/operations";
import { useXCollectionStatus } from "../../queries/use-x-collection-status";
import { XCollectionOverview } from "./x-collection-monitoring";
vi.mock("../../queries/use-x-collection-status",()=>({useXCollectionStatus:vi.fn()}));
vi.mock("../../queries/use-x-reference-health",()=>({useXReferenceHealth:()=>({data:undefined})}));
vi.mock("../../queries/use-x-activity-status",()=>({useXActivityStatus:()=>({data:undefined})}));
vi.mock("./x-reference-health",()=>({XReferenceHealth:()=>null}));
afterEach(cleanup);
const status = {rss:{enabled:true},xApi:{intervalHours:12,nextRegularEligibleAt:Date.now()+3600000},accounts:[{handle:"member",officialBlockedReason:"shared_budget_unavailable"}]} as XCollectionStatusDto;
const show = () => render(createElement(XCollectionOverview,{operations:{xCollection:{intervalHours:24,nextEligibleAt:1}} as OperationsStatusResponse,loading:false,error:false,latestRun:undefined,runsLoading:false,runsError:false,runsUpdatedAt:Date.now(),enabled:true}));
it("uses account policy eligibility instead of the legacy operations anchor",()=>{
  vi.mocked(useXCollectionStatus).mockReturnValue({data:status,isError:false,isFetching:false} as ReturnType<typeof useXCollectionStatus>);
  show();
  expect(screen.getByText(/계정별 정기 12시간 주기/)).toBeTruthy();
  expect(screen.getByText(/@member · 공통 예산 확인 불가로 REST 실행 차단/)).toBeTruthy();
  expect(screen.queryByText(/전체 점검 24시간 주기/)).toBeNull();
});
it("marks policy refresh failure without presenting the old eligibility as current",()=>{
  vi.mocked(useXCollectionStatus).mockReturnValue({data:status,isError:true,isFetching:false} as ReturnType<typeof useXCollectionStatus>);
  show();
  expect(screen.getByText(/공식 점검 자격 최신 조회 실패/)).toBeTruthy();
  expect(screen.getByText("설정 확인 불가")).toBeTruthy();
});
