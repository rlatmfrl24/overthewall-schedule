import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDownIcon, Trash2 } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { ButtonGroup, ButtonGroupSeparator } from "./ui/button-group";

interface ScheduleDialogProps {
  onSubmit: (data: {
    id?: number;
    member_uid: number;
    date: Date;
    start_time: string | null;
    title: string;
    status: ScheduleStatus;
  }) => void;
  onDelete?: (id: number) => void;
  members: Member[];
  initialDate?: Date;
  schedule?: ScheduleItem | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ScheduleDialog = ({
  onSubmit,
  onDelete,
  members,
  initialDate,
  schedule,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: ScheduleDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = setControlledOpen ?? setInternalOpen;

  const [memberUid, setMemberUid] = useState<number | "">("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [date, setDate] = useState(
    initialDate ? new Date(initialDate) : new Date()
  );
  const [status, setStatus] = useState<ScheduleStatus>("방송");

  // Time picker states
  const [isTimeUndecided, setIsTimeUndecided] = useState(false);
  const [startHour, setStartHour] = useState("00");
  const [startMinute, setStartMinute] = useState("00");

  const [title, setTitle] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (schedule) {
      setMemberUid(schedule.member_uid);
      setDate(new Date(schedule.date));
      setStatus(schedule.status);

      if (schedule.start_time) {
        setIsTimeUndecided(false);
        const [h, m] = schedule.start_time.split(":");
        setStartHour(h);
        setStartMinute(m);
      } else {
        setIsTimeUndecided(true);
        setStartHour("00");
        setStartMinute("00");
      }

      setTitle(schedule.title || "");
    } else {
      // Reset form when opening in "add" mode or when closed
      if (!isOpen) {
        setMemberUid("");
        setDate(initialDate ? new Date(initialDate) : new Date());
        setStatus("방송");
        setIsTimeUndecided(false);
        setStartHour("00");
        setStartMinute("00");
        setTitle("");
      }
    }
  }, [schedule, isOpen, initialDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (memberUid === "") {
      setAlertMessage("멤버를 선택해주세요.");
      setAlertOpen(true);
      return;
    }

    let finalStartTime: string | null = null;
    if (status === "방송" && !isTimeUndecided) {
      finalStartTime = `${startHour}:${startMinute}`;
    }

    onSubmit({
      id: schedule?.id,
      member_uid: Number(memberUid),
      date,
      status,
      start_time: finalStartTime,
      title,
    });

    if (!controlledOpen) {
      setIsOpen(false);
    }
  };

  const handleDelete = () => {
    if (schedule?.id && onDelete) {
      setConfirmOpen(true);
    }
  };

  const onConfirmDelete = () => {
    if (schedule?.id && onDelete) {
      onDelete(schedule.id);
      if (!controlledOpen) {
        setIsOpen(false);
      }
    }
    setConfirmOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{schedule ? "스케쥴 수정" : "스케쥴 추가"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>멤버</FieldLabel>
              <Select
                value={memberUid.toString()}
                onValueChange={(value) => setMemberUid(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="멤버 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {members.map((member) => (
                      <SelectItem
                        key={member.uid}
                        value={member.uid.toString()}
                      >
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>상태</FieldLabel>
              {status === "휴방" || status === "미정" || status === "게릴라" ? (
                <FieldDescription>
                  휴방, 미정, 게릴라 입력 시 다른 일정은 모두 삭제되니
                  주의해주세요.
                </FieldDescription>
              ) : null}

              <ButtonGroup>
                <Button
                  type="button"
                  variant={status === "방송" ? "default" : "outline"}
                  onClick={() => setStatus("방송")}
                >
                  방송
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  variant={status === "휴방" ? "default" : "outline"}
                  onClick={() => {
                    setStatus("휴방");
                    setIsTimeUndecided(true);
                    setStartHour("00");
                    setStartMinute("00");
                    setTitle("휴방");
                  }}
                >
                  휴방
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  variant={status === "미정" ? "default" : "outline"}
                  onClick={() => {
                    setStatus("미정");
                    setIsTimeUndecided(true);
                    setStartHour("00");
                    setStartMinute("00");
                    setTitle("미정");
                  }}
                >
                  미정
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  variant={status === "게릴라" ? "default" : "outline"}
                  onClick={() => {
                    setStatus("게릴라");
                    setIsTimeUndecided(true);
                    setStartHour("00");
                    setStartMinute("00");
                    setTitle("게릴라");
                  }}
                >
                  게릴라
                </Button>
              </ButtonGroup>
            </Field>
            <Field>
              <FieldLabel>날짜</FieldLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="date"
                    className={cn(
                      "w-full justify-between text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    {date ? date.toLocaleDateString() : "날짜 선택"}
                    <ChevronDownIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto overflow-hidden p-0"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={date}
                    captionLayout="dropdown"
                    onSelect={(date) => {
                      if (!date) return;
                      setDate(date);
                      setIsCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
            {status == "방송" && (
              <>
                <Field>
                  <FieldLabel>제목</FieldLabel>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>시간</FieldLabel>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2">
                      <Select
                        disabled={isTimeUndecided}
                        value={startHour}
                        onValueChange={setStartHour}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="시" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString().padStart(2, "0")}
                            >
                              {i.toString().padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">:</span>
                      <Select
                        disabled={isTimeUndecided}
                        value={startMinute}
                        onValueChange={setStartMinute}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="분" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }).map((_, i) => (
                            <SelectItem
                              key={i}
                              value={(i * 5).toString().padStart(2, "0")}
                            >
                              {(i * 5).toString().padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2 min-w-fit">
                      <Checkbox
                        id="time-undecided"
                        checked={isTimeUndecided}
                        onCheckedChange={(checked) => {
                          setIsTimeUndecided(checked === true);
                          if (checked) {
                            setStartHour("00");
                            setStartMinute("00");
                          }
                        }}
                      />
                      <label
                        htmlFor="time-undecided"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        시간 미정
                      </label>
                    </div>
                  </div>
                </Field>
              </>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {schedule ? "수정" : "추가"}
              </Button>
              {schedule && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </DialogContent>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>알림</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAlertOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
