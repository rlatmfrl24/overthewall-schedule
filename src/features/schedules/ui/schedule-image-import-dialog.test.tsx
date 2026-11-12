// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import { createMemberFixture } from "@/test/member-fixtures";
import { ScheduleImageImportDialog } from "./schedule-image-import-dialog";
import type { ScheduleImageDraft } from "@contracts/schedule-image-import";
import { ApiError } from "@/shared/api/client";
const mocks=vi.hoisted(()=>({read:vi.fn(),context:vi.fn(),apply:vi.fn(),result:vi.fn(),confirm:vi.fn()}));
vi.mock("@clerk/clerk-react",()=>({useAuth:()=>({isSignedIn:true,userId:"user"}),SignInButton:({children}:{children:React.ReactNode})=>children}));
vi.mock("../api/schedule-image-import",()=>({readScheduleImage:mocks.read,fetchImageContext:mocks.context,applyImageGroup:mocks.apply,fetchImageResult:mocks.result}));
const draft:ScheduleImageDraft={model:"gpt-6-luna",warnings:[],usage:{inputTokens:1,outputTokens:1},rows:[{
  clientId:"1",sourceMemberName:"하루",memberUid:1,date:"2026-11-12",sourceDate:"11/12",weekday:4,startTime:"21:00",sourceTime:"21:00",dateShiftDays:0,
  needsWeekConfirmation:false,timeState:"specified",status:"방송",title:"원문 제목",needsReview:[],
}]};
const member=createMemberFixture({uid:1,name:"하루"});
function mount(onOpenChange=vi.fn()) {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=render(<QueryClientProvider client={client}><UnsavedChangesContext.Provider value={{register:()=>{},confirm:mocks.confirm}}>
    <ScheduleImageImportDialog members={[member,createMemberFixture({uid:2,name:"다른 멤버"})]} initialDate={new Date("2026-11-12T12:00:00+09:00")} onOpenChange={onOpenChange} isAdmin={false}/>
  </UnsavedChangesContext.Provider></QueryClientProvider>);
  return {...view,onOpenChange};
}
async function read() {
  fireEvent.change(screen.getByLabelText("일정표 이미지"),{target:{files:[new File(["image"],"schedule.png",{type:"image/png"})]}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"일정표 읽기"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"일정표 읽기"}));
  await screen.findByLabelText("제목 1");
}
beforeEach(()=>{
  vi.clearAllMocks();mocks.read.mockResolvedValue(structuredClone(draft));mocks.context.mockResolvedValue({expected:"[]",schedules:[]});
  mocks.apply.mockImplementation(async (input)=>({operationId:input.operationId,state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000}));
  mocks.confirm.mockResolvedValue(true);
  vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal("URL",Object.assign(URL,{createObjectURL:vi.fn(()=>"blob:local-image"),revokeObjectURL:vi.fn()}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows_external_image_transfer_notice_before_reading",()=>{
  mount();expect(screen.getByText(/이미지가 OpenAI로 전송됩니다/)).toBeTruthy();expect(mocks.read).not.toHaveBeenCalled();
});
it("editing_does_not_repeat_model_call and excluded_rows_never_reach_apply",async()=>{
  mount();await read();fireEvent.change(screen.getByLabelText("제목 1"),{target:{value:"사용자 수정"}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByLabelText("적용 선택 1"));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));expect(mocks.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("적용 선택 1"));fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(1));
  expect(mocks.apply.mock.calls[0][0].changes[0].title).toBe("사용자 수정");expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("blocks_unresolved_member_or_date",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[{...draft.rows[0],memberUid:null,date:null,needsWeekConfirmation:true}]});
  mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  expect(mocks.apply).not.toHaveBeenCalled();
});
it("confirms_unsaved_close_and_clears_image_and_draft",async()=>{
  const view=mount();await read();mocks.confirm.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledTimes(1));expect(view.onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("ignores_response_from_replaced_or_cancelled_image",async()=>{
  let resolve:(value:ScheduleImageDraft)=>void=()=>{};mocks.read.mockImplementation(()=>new Promise<ScheduleImageDraft>(done=>{resolve=done;}));
  mount();fireEvent.change(screen.getByLabelText("일정표 이미지"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"일정표 읽기"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"일정표 읽기"}));fireEvent.click(await screen.findByRole("button",{name:"인식 취소"}));resolve(draft);
  await waitFor(()=>expect(screen.queryByLabelText("제목 1")).toBeNull());
});
it("keeps_prepared_draft_usable_after_ai_budget_exhaustion",async()=>{
  mount();await read();mocks.read.mockRejectedValueOnce(new ApiError("한도 도달",429));
  fireEvent.click(screen.getByRole("button",{name:"다시 읽기"}));await screen.findByText("한도 도달");
  expect((screen.getByLabelText("제목 1") as HTMLInputElement).value).toBe("원문 제목");
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("requires_confirmation_of_exclusive_status_deletions",async()=>{
  mocks.context.mockResolvedValue({expected:"existing",schedules:[{id:10,member_uid:1,date:"2026-11-12",start_time:"20:00",status:"방송",title:"기존 방송",created_at:null}]});
  mount();await read();await screen.findByLabelText("기존 일정 처리 1");
  fireEvent.change(screen.getByLabelText("상태 1"),{target:{value:"휴방"}});
  fireEvent.change(screen.getByLabelText("기존 일정 처리 1"),{target:{value:"add"}});
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByRole("alertdialog");expect(mocks.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"삭제 영향을 확인하고 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());expect(mocks.apply.mock.calls[0][0].confirmedDeletedIds).toEqual([10]);
});
it("keeps applied rows locked when mapping another unresolved row with the same source name",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",memberUid:null,date:"2026-11-13"}]});
  mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText("멤버 2"),{target:{value:"2"}});
  expect((screen.getByLabelText("제목 1") as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
  expect((screen.getByLabelText("멤버 1") as HTMLSelectElement).value).toBe("1");
  expect(mocks.read).toHaveBeenCalledOnce();
});

it("keeps excluded rows editable after another row on the same day is applied",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",title:"추가 방송",startTime:"22:00"}]});
  mount();await read();fireEvent.click(screen.getByLabelText("적용 선택 2"));fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  await waitFor(()=>expect((screen.getByLabelText("제목 2") as HTMLInputElement).closest("fieldset")?.disabled).toBe(false));
});
it("allows a 409 review row to move dates and apply with a fresh context",async()=>{
  mocks.apply.mockRejectedValueOnce(new ApiError("기존 일정 변경",409));
  mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));await screen.findByText(/적용 실패/);
  fireEvent.change(screen.getByLabelText("날짜 1"),{target:{value:"2026-11-13"}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(2));
  expect(mocks.apply.mock.calls[1][0].date).toBe("2026-11-13");expect(mocks.read).toHaveBeenCalledOnce();
});
it("allows a 403 review row to change members and apply without rereading the image",async()=>{
  mocks.apply.mockRejectedValueOnce(new ApiError("권한 변경",403));
  mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));await screen.findByText(/적용 실패/);
  fireEvent.change(screen.getByLabelText("멤버 1"),{target:{value:"2"}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(2));
  expect(mocks.apply.mock.calls[1][0].memberUid).toBe(2);expect(mocks.read).toHaveBeenCalledOnce();
});
