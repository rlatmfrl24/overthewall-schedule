// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScheduleAddMenu } from "./schedule-add-menu";
vi.mock("@clerk/clerk-react",()=>({useAuth:()=>({userId:null})}));
vi.mock("./schedule-image-import-dialog",()=>({ScheduleImageImportDialog:()=> <div role="dialog">이미지 입력</div>}));
afterEach(cleanup);
it("keeps_manual_entry_available and opens image import from the shared daily/weekly control",()=>{
  const manual=vi.fn();render(<ScheduleAddMenu members={[]} initialDate={new Date()} onManual={manual}/>);
  fireEvent.pointerDown(screen.getByRole("button",{name:"스케쥴 추가"}),{button:0,ctrlKey:false,pointerType:"mouse"});
  fireEvent.click(screen.getByRole("menuitem",{name:"직접 입력하기"}));expect(manual).toHaveBeenCalledOnce();
  fireEvent.pointerDown(screen.getByRole("button",{name:"스케쥴 추가"}),{button:0,ctrlKey:false,pointerType:"mouse"});
  fireEvent.click(screen.getByRole("menuitem",{name:"이미지로 스케쥴 추가하기"}));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
