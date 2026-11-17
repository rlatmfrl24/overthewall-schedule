// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScheduleAddMenu } from "./schedule-add-menu";
vi.mock("@clerk/clerk-react",()=>({useAuth:()=>({userId:null})}));
vi.mock("./schedule-image-import-dialog",()=>({ScheduleImageImportDialog:({onOpenChange}:{onOpenChange:(open:boolean)=>void})=> <div role="dialog">이미지 입력<button onClick={()=>onOpenChange(false)}>닫기</button></div>}));
afterEach(cleanup);
it("opens manual entry directly without opening the menu",()=>{
  const manual=vi.fn();render(<ScheduleAddMenu members={[]} initialDate={new Date()} onManual={manual}/>);
  const direct=screen.getByRole("button",{name:"스케쥴 추가"});
  fireEvent.click(direct);
  expect(manual).toHaveBeenCalledOnce();
  expect(direct.hasAttribute("aria-haspopup")).toBe(false);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps both existing options in the separate dropdown",()=>{
  const manual=vi.fn();render(<ScheduleAddMenu members={[]} initialDate={new Date()} onManual={manual}/>);
  const dropdown=screen.getByRole("button",{name:"스케쥴 추가 방법 선택"});
  fireEvent.pointerDown(dropdown,{button:0,ctrlKey:false,pointerType:"mouse"});
  expect(manual).not.toHaveBeenCalled();
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  fireEvent.click(screen.getByRole("menuitem",{name:"직접 입력하기"}));expect(manual).toHaveBeenCalledOnce();
  fireEvent.pointerDown(dropdown,{button:0,ctrlKey:false,pointerType:"mouse"});
  fireEvent.click(screen.getByRole("menuitem",{name:"이미지로 스케쥴 추가하기"}));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("returns focus to the dropdown after closing image import",async()=>{
  render(<ScheduleAddMenu members={[]} initialDate={new Date()} onManual={vi.fn()}/>);
  const dropdown=screen.getByRole("button",{name:"스케쥴 추가 방법 선택"});
  fireEvent.pointerDown(dropdown,{button:0,ctrlKey:false,pointerType:"mouse"});
  fireEvent.click(screen.getByRole("menuitem",{name:"이미지로 스케쥴 추가하기"}));
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));
  await waitFor(()=>expect(document.activeElement).toBe(dropdown));
});
