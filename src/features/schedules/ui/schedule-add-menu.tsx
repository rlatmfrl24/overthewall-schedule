import { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Plus, ChevronDown, ImagePlus, PenLine } from "lucide-react";
import type { Member } from "@/features/members";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { ScheduleImageImportDialog } from "./schedule-image-import-dialog";

export function ScheduleAddMenu({members,initialDate,onManual,isAdmin=false}:{members:Member[];initialDate:Date;onManual:()=>void;isAdmin?:boolean}) {
  const [open,setOpen]=useState(false),button=useRef<HTMLButtonElement>(null);
  const {userId}=useAuth();
  return <>
    {/* Finite outer radii prevent the browser from shrinking the 4px inner corners. */}
    <ButtonGroup aria-label="스케쥴 추가" className="w-auto gap-0.5 [&>*:not(:last-child)]:rounded-r-[4px] [&>*:not(:first-child)]:rounded-l-[4px]">
      <Button type="button" onClick={onManual} className="h-10 flex-1 rounded-[20px] bg-indigo-600 px-4 text-white hover:bg-indigo-700"><Plus className="h-4 w-4"/><span>스케쥴 추가</span></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" ref={button} size="icon-lg" aria-label="스케쥴 추가 방법 선택" className="rounded-[20px] bg-indigo-600 text-white hover:bg-indigo-700 sm:pointer-fine:w-8"><ChevronDown className="h-4 w-4"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={onManual}><PenLine className="h-4 w-4"/>직접 입력하기</DropdownMenuItem><DropdownMenuItem onSelect={()=>setOpen(true)}><ImagePlus className="h-4 w-4"/>이미지로 스케쥴 추가하기</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
    {open&&<ScheduleImageImportDialog key={userId??"signed-out"} members={members} initialDate={initialDate} isAdmin={isAdmin} onOpenChange={next=>{setOpen(next);if(!next)requestAnimationFrame(()=>button.current?.focus());}}/>}
  </>;
}
