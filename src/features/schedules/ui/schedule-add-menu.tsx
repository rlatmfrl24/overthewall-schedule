import { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Plus, ChevronDown, ImagePlus, PenLine } from "lucide-react";
import type { Member } from "@/features/members";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { ScheduleImageImportDialog } from "./schedule-image-import-dialog";

export function ScheduleAddMenu({members,initialDate,onManual,isAdmin=false}:{members:Member[];initialDate:Date;onManual:()=>void;isAdmin?:boolean}) {
  const [open,setOpen]=useState(false),button=useRef<HTMLButtonElement>(null);
  const {userId}=useAuth();
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button ref={button} aria-label="스케쥴 추가" className="h-10 rounded-full px-4"><Plus className="h-4 w-4"/><span>스케쥴 추가</span><ChevronDown className="h-3 w-3"/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={onManual}><PenLine className="h-4 w-4"/>직접 입력하기</DropdownMenuItem><DropdownMenuItem onSelect={()=>setOpen(true)}><ImagePlus className="h-4 w-4"/>이미지로 스케쥴 추가하기</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    {open&&<ScheduleImageImportDialog key={userId??"signed-out"} members={members} initialDate={initialDate} isAdmin={isAdmin} onOpenChange={next=>{setOpen(next);if(!next)requestAnimationFrame(()=>button.current?.focus());}}/>}
  </>;
}
