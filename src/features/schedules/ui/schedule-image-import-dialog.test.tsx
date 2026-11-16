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
const draft:ScheduleImageDraft={model:"gemini-3.5-flash-lite",warnings:[],usage:{inputTokens:1,outputTokens:1},rows:[{
  clientId:"1",sourceMemberName:"하루",memberUid:1,date:"2026-11-12",sourceDate:"11/12",weekday:4,startTime:"21:00",sourceTime:"21:00",dateShiftDays:0,
  needsWeekConfirmation:false,timeState:"specified",status:"방송",title:"원문 제목",needsReview:[],
}]};
const member=createMemberFixture({uid:1,name:"하루"});
Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:()=>{}});
async function chooseOption(label:string,option:string) {
  const trigger=screen.getByRole("combobox",{name:label});
  trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown",code:"ArrowDown"});
  fireEvent.click(await screen.findByRole("option",{name:option}));
}
function mount(onOpenChange=vi.fn()) {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=render(<QueryClientProvider client={client}><UnsavedChangesContext.Provider value={{register:()=>{},confirm:mocks.confirm}}>
    <ScheduleImageImportDialog members={[member,createMemberFixture({uid:2,name:"다른 멤버"})]} initialDate={new Date("2026-11-12T12:00:00+09:00")} onOpenChange={onOpenChange} isAdmin={false}/>
  </UnsavedChangesContext.Provider></QueryClientProvider>);
  return {...view,onOpenChange,client};
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
it("keeps provider transmission notices out of the image editor",()=>{
  mount();expect(screen.queryByText(/이미지는 OpenRouter·Google로 전송됩니다/)).toBeNull();
  expect(screen.queryByRole("link",{name:"OpenRouter 정책"})).toBeNull();expect(mocks.read).not.toHaveBeenCalled();
});
it("returns to the schedule after all selected groups are saved and refreshed without success logs",async()=>{
  const view=mount();await read();
  let finish:()=>void=()=>{};
  const refreshing=new Promise<void>(resolve=>{finish=resolve;});
  vi.spyOn(view.client,"invalidateQueries").mockReturnValueOnce(refreshing);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  expect(view.onOpenChange).not.toHaveBeenCalled();
  finish();await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  expect(screen.queryByText(/적용 완료/)).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("keeps failed groups available instead of returning to the schedule after partial success",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",date:"2026-11-13",weekday:5}]});
  mocks.apply.mockResolvedValueOnce({operationId:"first",state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000}).mockRejectedValueOnce(new ApiError("기존 일정 변경",409));
  const view=mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByText(/적용 실패/);expect(view.onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByText(/적용 완료/)).toBeNull();
});
it("returns after retrying a failed refresh without writing the schedule twice",async()=>{
  const view=mount();await read();
  vi.spyOn(view.client,"invalidateQueries").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByRole("button",{name:"일정표 조회만 재시도"});expect(view.onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"일정표 조회만 재시도"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));expect(mocks.apply).toHaveBeenCalledOnce();
});
it.each(["new row","edited excluded row"])("preserves %s added before refresh recovery and allows it to be applied",async kind=>{
  if(kind==="edited excluded row")mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",date:"2026-11-13",weekday:5}]});
  const view=mount();await read();
  if(kind==="edited excluded row")fireEvent.click(screen.getByLabelText("적용 선택 2"));
  vi.spyOn(view.client,"invalidateQueries").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  const retry=await screen.findByRole("button",{name:"일정표 조회만 재시도"});
  await waitFor(()=>expect(retry.hasAttribute("disabled")).toBe(false));
  if(kind==="new row"){
    fireEvent.click(screen.getByRole("button",{name:"빠진 일정 추가"}));
    await chooseOption("멤버 2","하루");
    fireEvent.change(screen.getByLabelText("날짜 2"),{target:{value:"2026-11-13"}});
    fireEvent.click(screen.getByLabelText("시간 미정 2"));
  }else fireEvent.click(screen.getByLabelText("적용 선택 2"));
  fireEvent.change(screen.getByLabelText("제목 2"),{target:{value:"새로 작성한 미저장 제목"}});
  fireEvent.click(retry);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"일정표 조회만 재시도"})).toBeNull());
  expect(view.onOpenChange).not.toHaveBeenCalled();
  expect((screen.getByLabelText("제목 2") as HTMLTextAreaElement).value).toBe("새로 작성한 미저장 제목");
  expect(mocks.apply).toHaveBeenCalledOnce();expect(mocks.read).toHaveBeenCalledOnce();
  mocks.confirm.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));
  await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledOnce());expect(view.onOpenChange).not.toHaveBeenCalled();
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  expect(mocks.apply).toHaveBeenCalledTimes(2);
  expect(mocks.apply.mock.calls[1][0].changes).toMatchObject([{title:"새로 작성한 미저장 제목"}]);
});
it("preserves new work when an earlier unknown result is confirmed",async()=>{
  mocks.apply.mockRejectedValueOnce(new Error("response lost"));
  mocks.result.mockResolvedValueOnce({state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000});
  const view=mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  const confirm=await screen.findByRole("button",{name:"결과 확인"});
  await waitFor(()=>expect(confirm.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"빠진 일정 추가"}));
  fireEvent.change(screen.getByLabelText("제목 2"),{target:{value:"결과 확인 전 새 초안"}});
  fireEvent.click(confirm);
  await waitFor(()=>expect(mocks.result).toHaveBeenCalledOnce());
  await waitFor(()=>expect(screen.queryByRole("button",{name:"결과 확인"})).toBeNull());
  expect(view.onOpenChange).not.toHaveBeenCalled();
  expect((screen.getByLabelText("제목 2") as HTMLTextAreaElement).value).toBe("결과 확인 전 새 초안");
  expect(mocks.apply).toHaveBeenCalledOnce();
});
it("keeps a failed group's draft after comparing again and recovering a failed refresh",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",date:"2026-11-13",weekday:5}]});
  mocks.apply.mockResolvedValueOnce({state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000}).mockRejectedValueOnce(new ApiError("기존 일정 변경",409));
  const view=mount();await read();
  vi.spyOn(view.client,"invalidateQueries").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  const retry=await screen.findByRole("button",{name:"일정표 조회만 재시도"});
  await waitFor(()=>expect(retry.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"기존 일정 다시 비교"}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"기존 일정 다시 비교"})).toBeNull());
  fireEvent.click(retry);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"일정표 조회만 재시도"})).toBeNull());
  expect(view.onOpenChange).not.toHaveBeenCalled();
  expect((screen.getByLabelText("제목 2") as HTMLTextAreaElement).value).toBe("원문 제목");
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));expect(mocks.apply).toHaveBeenCalledTimes(3);
});
it("preserves a new draft after cancelling its deletion confirmation and recovering an earlier refresh",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",date:"2026-11-13",weekday:5}]});
  mocks.context.mockImplementation(async(_uid,date)=>date==="2026-11-13"?{expected:"existing",schedules:[{id:10,member_uid:1,date,start_time:"20:00",status:"방송",title:"기존 방송",created_at:null}]}:{expected:"[]",schedules:[]});
  const view=mount();await read();fireEvent.click(screen.getByLabelText("적용 선택 2"));
  vi.spyOn(view.client,"invalidateQueries").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  const retry=await screen.findByRole("button",{name:"일정표 조회만 재시도"});
  await waitFor(()=>expect(retry.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByLabelText("적용 선택 2"));
  await chooseOption("상태 2","휴방");await chooseOption("기존 일정 처리 2","새 일정으로 추가");
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByRole("alertdialog");fireEvent.click(screen.getByRole("button",{name:/^취소$/}));
  await waitFor(()=>expect(screen.queryByRole("alertdialog")).toBeNull());
  fireEvent.click(retry);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"일정표 조회만 재시도"})).toBeNull());
  expect(view.onOpenChange).not.toHaveBeenCalled();expect(mocks.apply).toHaveBeenCalledOnce();
  expect(screen.getByRole("combobox",{name:"상태 2"}).textContent).toBe("휴방");
});
it("locks editing and closing while a failed refresh is retried before returning",async()=>{
  const view=mount();await read();
  let finish:()=>void=()=>{};
  const refreshing=new Promise<void>(resolve=>{finish=resolve;});
  vi.spyOn(view.client,"invalidateQueries").mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(refreshing);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  const retry=await screen.findByRole("button",{name:"일정표 조회만 재시도"});
  await waitFor(()=>expect(retry.hasAttribute("disabled")).toBe(false));
  fireEvent.click(retry);
  expect(screen.getByRole("button",{name:"빠진 일정 추가"}).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button",{name:"이미지 바꾸기"}).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));
  expect(view.onOpenChange).not.toHaveBeenCalled();expect(mocks.confirm).not.toHaveBeenCalled();
  finish();await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  expect(mocks.apply).toHaveBeenCalledOnce();
});
it("returns after an unknown save is confirmed without submitting it again",async()=>{
  mocks.apply.mockRejectedValueOnce(new Error("response lost"));
  mocks.result.mockResolvedValueOnce({state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000});
  const view=mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByRole("button",{name:"결과 확인"});expect(view.onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"결과 확인"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));expect(mocks.apply).toHaveBeenCalledOnce();
});
it("keeps the selected filename and preview inside the image attachment control",async()=>{
  mount();await read();
  const attachment=screen.getByRole("group",{name:"일정표 이미지 첨부"});
  expect(attachment.contains(screen.getByText("schedule.png"))).toBe(true);
  expect(attachment.contains(screen.getByAltText("첨부한 일정표"))).toBe(true);
  expect(screen.queryByText(/^원본:/)).toBeNull();
});
it("accepts image drops below the load button and keeps the week and focus outside that area",async()=>{
  mount();
  const attachment=screen.getByRole("group",{name:"일정표 이미지 첨부"});
  const dropArea=screen.getByRole("group",{name:"이미지 드롭 영역"});
  const file=new File(["image"],"dropped.png",{type:"image/png"});
  expect(dropArea.contains(screen.getByRole("button",{name:"이미지 선택"}))).toBe(false);
  expect(dropArea.contains(screen.getByLabelText("적용 주"))).toBe(false);
  fireEvent.drop(attachment,{dataTransfer:{files:[file]}});
  expect(screen.queryByAltText("첨부한 일정표")).toBeNull();
  fireEvent.drop(dropArea,{dataTransfer:{files:[file]}});
  expect(dropArea.contains(await screen.findByAltText("첨부한 일정표"))).toBe(true);
  expect(dropArea.contains(screen.getByText("dropped.png"))).toBe(true);
  expect(dropArea.contains(screen.getByRole("combobox",{name:"확대할 일정 영역"}))).toBe(false);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("fills missing dates from the displayed week and moves them together when the week changes",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[{...draft.rows[0],date:null,needsWeekConfirmation:true},{...draft.rows[0],clientId:"2",date:null,weekday:5,needsWeekConfirmation:true}]});
  mount();await read();
  expect((screen.getByLabelText("날짜 1") as HTMLInputElement).value).toBe("2026-11-12");
  expect((screen.getByLabelText("날짜 2") as HTMLInputElement).value).toBe("2026-11-13");
  expect(screen.queryByRole("button",{name:"기준 주 확인·일괄 보정"})).toBeNull();
  fireEvent.change(screen.getByLabelText("적용 주"),{target:{value:"2026-11-16"}});
  expect((screen.getByLabelText("날짜 1") as HTMLInputElement).value).toBe("2026-11-19");
  expect((screen.getByLabelText("날짜 2") as HTMLInputElement).value).toBe("2026-11-20");
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("distinguishes a scheduled broadcast from an undecided time and a day off",async()=>{
  mount();await read();
  const status=screen.getByRole("combobox",{name:"상태 1"});
  fireEvent.keyDown(status,{key:"ArrowDown",code:"ArrowDown"});
  expect(screen.getAllByRole("option").map(option=>option.textContent)).toEqual(["상태 선택","방송","휴방","게릴라"]);
  fireEvent.click(screen.getByRole("option",{name:"방송"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"시간 미정 1"}));
  expect((screen.getByLabelText("시간 1") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  expect(mocks.apply.mock.calls[0][0].changes[0]).toMatchObject({status:"방송",startTime:null});
});
it("keeps cleared shadcn member and status selections unresolved until chosen again",async()=>{
  mount();await read();
  await chooseOption("멤버 1","멤버 확인");
  await chooseOption("상태 1","상태 선택");
  expect(screen.getByRole("combobox",{name:"멤버 1"}).textContent).toBe("멤버 확인");
  expect(screen.getByText(/멤버 선택 · 방송 상태 선택/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  expect(mocks.apply).not.toHaveBeenCalled();
  await chooseOption("멤버 1","하루");
  await chooseOption("상태 1","방송");
  fireEvent.click(screen.getByRole("checkbox",{name:"시간 미정 1"}));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  expect(mocks.apply.mock.calls[0][0].changes[0]).toMatchObject({status:"방송",startTime:null});
});
it("preserves the manually edited weekday when moving all dates to another week",async()=>{
  mount();await read();
  fireEvent.change(screen.getByLabelText("날짜 1"),{target:{value:"2026-11-13"}});
  fireEvent.change(screen.getByLabelText("적용 주"),{target:{value:"2026-11-16"}});
  expect((screen.getByLabelText("날짜 1") as HTMLInputElement).value).toBe("2026-11-20");
});
it("preserves a recognized undecided time under the single broadcast status and requires a time when unchecked",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[{...draft.rows[0],startTime:null,timeState:"undecided"}]});
  mount();await read();
  expect(screen.getByRole("combobox",{name:"상태 1"}).textContent).toBe("방송");
  const undecided=screen.getByRole("checkbox",{name:"시간 미정 1"});
  expect(undecided.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(undecided);
  expect((screen.getByLabelText("시간 1") as HTMLInputElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));expect(mocks.apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("시간 1"),{target:{value:"20:30"}});
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());
  expect(mocks.apply.mock.calls[0][0].changes[0]).toMatchObject({status:"방송",startTime:"20:30"});
});
it("uses the chosen schedule area only on explicit reading and resets it for a new image",async()=>{
  mount();
  const file=new File(["image"],"schedule.png",{type:"image/png"});
  fireEvent.change(screen.getByLabelText("일정표 이미지"),{target:{files:[file]}});
  await chooseOption("확대할 일정 영역","왼쪽 영역");
  expect(mocks.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"일정표 읽기"}));await screen.findByLabelText("제목 1");
  expect(mocks.read.mock.calls[0][2]).toBe("left");
  await chooseOption("확대할 일정 영역","오른쪽 영역");expect(mocks.read).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("일정표 이미지"),{target:{files:[new File(["new"],"new.png",{type:"image/png"})]}});
  await waitFor(()=>expect(screen.getByRole("combobox",{name:"확대할 일정 영역"}).textContent).toBe("전체 이미지"));
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("preserves separate headline and subtitle lines through editing and applying",async()=>{
  const title="문 스위퍼즈\nw. 합방 멤버";
  mocks.read.mockResolvedValue({...draft,rows:[{...draft.rows[0],title}]});
  mount();await read();expect((screen.getByLabelText("제목 1") as HTMLTextAreaElement).value).toBe(title);
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(1));
  expect(mocks.apply.mock.calls[0][0].changes[0].title).toBe(title);
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
it.each([{memberUid:null,date:null,weekday:4},{memberUid:1,date:null,weekday:null}])("blocks unresolved member or unplaceable date: %j",async unresolved=>{
  mocks.read.mockResolvedValue({...draft,rows:[{...draft.rows[0],...unresolved,needsWeekConfirmation:true}]});
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
  await chooseOption("상태 1","휴방");
  await chooseOption("기존 일정 처리 1","새 일정으로 추가");
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByRole("alertdialog");expect(mocks.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"삭제 영향을 확인하고 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledOnce());expect(mocks.apply.mock.calls[0][0].confirmedDeletedIds).toEqual([10]);
});
it("keeps applied rows locked during partial failure when mapping an unresolved row with the same source name",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",memberUid:null,date:"2026-11-13"},{...draft.rows[0],clientId:"3",date:"2026-11-14",weekday:6}]});
  mocks.apply.mockResolvedValueOnce({state:"applied",scheduleIds:[1],expiresAt:Date.now()+86400000}).mockRejectedValueOnce(new ApiError("기존 일정 변경",409));
  const view=mount();await read();fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await screen.findByText(/적용 실패/);expect(view.onOpenChange).not.toHaveBeenCalled();
  await chooseOption("멤버 2","다른 멤버");
  expect((screen.getByLabelText("제목 1") as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
  expect(screen.getByRole("combobox",{name:"멤버 1"}).textContent).toBe("하루");
  expect(mocks.read).toHaveBeenCalledOnce();
});

it("returns after saving selected rows without submitting excluded rows on the same day",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",title:"추가 방송",startTime:"22:00"}]});
  const view=mount();await read();fireEvent.click(screen.getByLabelText("적용 선택 2"));fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.apply.mock.calls[0][0].changes.map((change:{clientId:string})=>change.clientId)).toEqual(["1"]);
});
it("applies an explicit new event when an identical earlier row keeps the existing schedule",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2"}]});
  mocks.context.mockResolvedValue({expected:"existing",schedules:[{id:10,member_uid:1,date:"2026-11-12",start_time:"20:00",status:"방송",title:"기존 방송",created_at:null}]});
  const view=mount();await read();await screen.findByLabelText("기존 일정 처리 2");
  await chooseOption("기존 일정 처리 2","새 일정으로 추가");
  expect(screen.getByLabelText("적용 선택 2").hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(view.onOpenChange).toHaveBeenCalledWith(false));
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.apply.mock.calls[0][0].changes).toMatchObject([{clientId:"2",id:null,title:"원문 제목"}]);
});
it("does not move any row in an unknown save group when changing the week",async()=>{
  mocks.read.mockResolvedValue({...draft,rows:[draft.rows[0],{...draft.rows[0],clientId:"2",title:"제외한 행",startTime:"22:00"},{...draft.rows[0],clientId:"3",date:"2026-11-13",weekday:5}]});
  mocks.apply.mockRejectedValueOnce(new Error("response lost"));
  mount();await read();fireEvent.click(screen.getByLabelText("적용 선택 2"));fireEvent.click(screen.getByLabelText("적용 선택 3"));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));await screen.findByText(/결과 확인 중입니다/);
  fireEvent.change(screen.getByLabelText("적용 주"),{target:{value:"2026-11-16"}});
  expect((screen.getByLabelText("날짜 1") as HTMLInputElement).value).toBe("2026-11-12");
  expect((screen.getByLabelText("날짜 2") as HTMLInputElement).value).toBe("2026-11-12");
  expect((screen.getByLabelText("날짜 3") as HTMLInputElement).value).toBe("2026-11-20");
  await chooseOption("멤버 3","다른 멤버");
  expect(screen.getByRole("combobox",{name:"멤버 2"}).textContent).toBe("하루");
  expect(mocks.apply).toHaveBeenCalledOnce();
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
  await chooseOption("멤버 1","다른 멤버");
  await waitFor(()=>expect(screen.getByRole("button",{name:"선택 일정 적용"}).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"선택 일정 적용"}));
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(2));
  expect(mocks.apply.mock.calls[1][0].memberUid).toBe(2);expect(mocks.read).toHaveBeenCalledOnce();
});
