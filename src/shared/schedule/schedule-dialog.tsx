import { useState, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { fetchSchedulesByDate } from "@/lib/api/schedules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";

type ScheduleSubmitData = {
  id?: number;
  member_uid: number;
  date: Date;
  start_time: string | null;
  title: string;
  status: ScheduleStatus;
};

type TimeParts = {
  hour: string;
  minute: string;
};

const DEFAULT_TIME: TimeParts = { hour: "00", minute: "00" };
const QUICK_TIME_PRESET_GROUPS = [
  {
    label: "오전",
    times: ["09:00", "10:00", "11:00", "11:30"] as const,
  },
  {
    label: "오후",
    times: ["18:00", "19:00", "20:00", "21:30"] as const,
  },
] as const;

interface ScheduleDialogProps {
  onSubmit: (data: ScheduleSubmitData) => void | Promise<void>;
  onDelete?: (id: number) => void | Promise<void>;
  members: Member[];
  initialDate?: Date;
  initialMemberUid?: number;
  schedule?: ScheduleItem | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ScheduleDialog = ({
  onSubmit,
  onDelete,
  members,
  initialDate,
  initialMemberUid,
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
  const [lastDecidedTime, setLastDecidedTime] = useState<TimeParts>(DEFAULT_TIME);

  const [title, setTitle] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [impactConfirmOpen, setImpactConfirmOpen] = useState(false);
  const [impactDeleteCount, setImpactDeleteCount] = useState<number | null>(0);
  const [pendingSubmitData, setPendingSubmitData] =
    useState<ScheduleSubmitData | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImpactChecking, setIsImpactChecking] = useState(false);

  const isBusy = isSubmitting || isImpactChecking;
  const hasMemberError = hasAttemptedSubmit && memberUid === "";
  const isExclusiveStatus = (nextStatus: ScheduleStatus) =>
    nextStatus === "휴방" || nextStatus === "미정" || nextStatus === "게릴라";
  const canSubmit = memberUid !== "" && !isBusy;
  const currentTimeValue = `${startHour}:${startMinute}`;

  const parseTimeValue = (value: string): TimeParts | null => {
    const [rawHour, rawMinute] = value.split(":");
    if (!rawHour || rawMinute === undefined) return null;

    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    return {
      hour: hour.toString().padStart(2, "0"),
      minute: minute.toString().padStart(2, "0"),
    };
  };

  const applyTime = (
    hour: string,
    minute: string,
    options?: { remember?: boolean }
  ) => {
    const normalizedHour = hour.padStart(2, "0").slice(-2);
    const normalizedMinute = minute.padStart(2, "0").slice(-2);

    setStartHour(normalizedHour);
    setStartMinute(normalizedMinute);

    if (options?.remember ?? true) {
      setLastDecidedTime({ hour: normalizedHour, minute: normalizedMinute });
    }
  };

  useEffect(() => {
    if (schedule) {
      setMemberUid(schedule.member_uid);
      setDate(new Date(schedule.date));
      setStatus(schedule.status);

      if (schedule.start_time) {
        setIsTimeUndecided(false);
        const parsed = parseTimeValue(schedule.start_time.slice(0, 5));
        if (parsed) {
          applyTime(parsed.hour, parsed.minute);
        } else {
          applyTime(DEFAULT_TIME.hour, DEFAULT_TIME.minute);
        }
      } else {
        setIsTimeUndecided(true);
        setLastDecidedTime(DEFAULT_TIME);
        applyTime(DEFAULT_TIME.hour, DEFAULT_TIME.minute, { remember: false });
      }

      setTitle(schedule.title || "");
    } else if (isOpen) {
      // Initialize form when opening in "add" mode
      setMemberUid(initialMemberUid || "");
      setDate(initialDate ? new Date(initialDate) : new Date());
      setStatus("방송");
      setIsTimeUndecided(false);
      setLastDecidedTime(DEFAULT_TIME);
      applyTime(DEFAULT_TIME.hour, DEFAULT_TIME.minute);
      setTitle("");
    }
    if (isOpen) {
      setHasAttemptedSubmit(false);
      setImpactConfirmOpen(false);
      setPendingSubmitData(null);
      setImpactDeleteCount(0);
      setIsImpactChecking(false);
    }
  }, [schedule, isOpen, initialDate, initialMemberUid]);

  const createSubmitData = (): ScheduleSubmitData | null => {
    if (memberUid === "") return null;

    let finalStartTime: string | null = null;
    if (status === "방송" && !isTimeUndecided) {
      finalStartTime = `${startHour}:${startMinute}`;
    }

    return {
      id: schedule?.id,
      member_uid: Number(memberUid),
      date,
      status,
      start_time: finalStartTime,
      title,
    };
  };

  const estimateDeleteCount = async (data: ScheduleSubmitData) => {
    const existing = await fetchSchedulesByDate(format(data.date, "yyyy-MM-dd"));
    const memberSchedules = existing.filter((item) => item.member_uid === data.member_uid);

    if (data.status === "미정") {
      return memberSchedules.length;
    }

    return memberSchedules.filter((item) => item.id !== data.id).length;
  };

  const submitSchedule = async (data: ScheduleSubmitData) => {
    setIsSubmitting(true);
    try {
      await Promise.resolve(onSubmit(data));
      if (!controlledOpen) {
        setIsOpen(false);
      }
    } catch (error) {
      console.error(error);
      setAlertMessage("스케쥴 저장 중 오류가 발생했습니다.");
      setAlertOpen(true);
    } finally {
      setIsSubmitting(false);
      setPendingSubmitData(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setHasAttemptedSubmit(true);
    if (memberUid === "") {
      return;
    }

    const submitData = createSubmitData();
    if (!submitData) return;

    if (isExclusiveStatus(submitData.status)) {
      setPendingSubmitData(submitData);
      setIsImpactChecking(true);
      try {
        const count = await estimateDeleteCount(submitData);
        setImpactDeleteCount(count);
      } catch (error) {
        console.error("Failed to estimate schedule conflicts", error);
        setImpactDeleteCount(null);
      } finally {
        setIsImpactChecking(false);
        setImpactConfirmOpen(true);
      }
      return;
    }

    await submitSchedule(submitData);
  };

  const onConfirmImpactSubmit = async () => {
    if (!pendingSubmitData) return;
    setImpactConfirmOpen(false);
    await submitSchedule(pendingSubmitData);
  };

  const handleDelete = () => {
    if (isBusy) return;
    if (schedule?.id && onDelete && !isSubmitting) {
      setDeleteConfirmOpen(true);
    }
  };

  const onConfirmDelete = async () => {
    if (schedule?.id && onDelete) {
      setIsSubmitting(true);
      try {
        await Promise.resolve(onDelete(schedule.id));
        if (!controlledOpen) {
          setIsOpen(false);
        }
      } catch (error) {
        console.error(error);
        setAlertMessage("스케쥴 삭제 중 오류가 발생했습니다.");
        setAlertOpen(true);
      } finally {
        setIsSubmitting(false);
      }
    }
    setDeleteConfirmOpen(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (isBusy) return;
    setIsOpen(nextOpen);
  };

  const impactStatus = pendingSubmitData?.status;
  const impactMemberName =
    members.find((member) => member.uid === pendingSubmitData?.member_uid)?.name ||
    (pendingSubmitData ? `UID ${pendingSubmitData.member_uid}` : "");
  const impactDateLabel = pendingSubmitData?.date.toLocaleDateString("ko-KR");

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "스케쥴 수정" : "스케쥴 추가"}</DialogTitle>
          <DialogDescription>스케쥴을 추가하거나 수정합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} aria-busy={isBusy}>
          <FieldGroup>
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
                  disabled={isBusy}
                  variant={status === "방송" ? "default" : "outline"}
                  onClick={() => setStatus("방송")}
                >
                  방송
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  disabled={isBusy}
                  variant={status === "휴방" ? "default" : "outline"}
                  onClick={() => {
                    setLastDecidedTime({ hour: startHour, minute: startMinute });
                    setStatus("휴방");
                    setIsTimeUndecided(true);
                    setTitle("휴방");
                  }}
                >
                  휴방
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  disabled={isBusy}
                  variant={status === "미정" ? "default" : "outline"}
                  onClick={() => {
                    setLastDecidedTime({ hour: startHour, minute: startMinute });
                    setStatus("미정");
                    setIsTimeUndecided(true);
                    setTitle("미정");
                  }}
                >
                  미정
                </Button>
                <ButtonGroupSeparator />
                <Button
                  type="button"
                  disabled={isBusy}
                  variant={status === "게릴라" ? "default" : "outline"}
                  onClick={() => {
                    setLastDecidedTime({ hour: startHour, minute: startMinute });
                    setStatus("게릴라");
                    setIsTimeUndecided(true);
                    setTitle("게릴라");
                  }}
                >
                  게릴라
                </Button>
              </ButtonGroup>
            </Field>
            <Field>
              <FieldLabel>멤버</FieldLabel>
              <Select
                disabled={isBusy}
                value={memberUid.toString()}
                onValueChange={(value) => setMemberUid(Number(value))}
              >
                <SelectTrigger aria-invalid={hasMemberError}>
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
              <FieldError>{hasMemberError ? "멤버를 선택해주세요." : null}</FieldError>
            </Field>
            <Field>
              <FieldLabel>제목</FieldLabel>
              <Input
                disabled={isBusy}
                value={title}
                placeholder="방송 예정"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>날짜</FieldLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="date"
                    disabled={isBusy}
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
              <Field>
                <FieldLabel>시간</FieldLabel>
                <FieldDescription>
                  직접 입력하거나 운영 패턴 기준(저녁 중심) 프리셋을 선택할 수 있습니다.
                </FieldDescription>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex-1 space-y-3">
                    <Input
                      type="time"
                      disabled={isBusy || isTimeUndecided}
                      value={currentTimeValue}
                      onChange={(e) => {
                        const parsed = parseTimeValue(e.target.value);
                        if (!parsed) return;
                        applyTime(parsed.hour, parsed.minute);
                      }}
                    />
                    <div className="space-y-3">
                      {QUICK_TIME_PRESET_GROUPS.map((group) => (
                        <div key={group.label} className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {group.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.times.map((preset) => (
                              <Button
                                key={preset}
                                type="button"
                                size="sm"
                                variant={
                                  preset === currentTimeValue ? "default" : "outline"
                                }
                                disabled={isBusy}
                                onClick={() => {
                                  const parsed = parseTimeValue(preset);
                                  if (!parsed) return;
                                  setIsTimeUndecided(false);
                                  applyTime(parsed.hour, parsed.minute);
                                }}
                              >
                                {preset}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 min-w-fit sm:pt-2">
                    <Checkbox
                      id="time-undecided"
                      disabled={isBusy}
                      checked={isTimeUndecided}
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setIsTimeUndecided(isChecked);
                        if (isChecked) {
                          setLastDecidedTime({ hour: startHour, minute: startMinute });
                          return;
                        }
                        applyTime(lastDecidedTime.hour, lastDecidedTime.minute);
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
            )}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={!canSubmit}>
                {isImpactChecking ? "영향 계산 중..." : isSubmitting ? "저장 중..." : schedule ? "수정" : "추가"}
              </Button>
              {schedule && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isBusy}
                  aria-label="스케쥴 삭제"
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

      <AlertDialog
        open={impactConfirmOpen}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          setImpactConfirmOpen(open);
          if (!open) {
            setPendingSubmitData(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 일정 정리 확인</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>{impactMemberName}</strong> · <strong>{impactDateLabel}</strong>
              </p>
              <p>
                상태를 <strong>{impactStatus}</strong>(으)로 저장하면 기존 일정이 정리됩니다.
              </p>
              <p>
                {impactDeleteCount === null
                  ? "삭제될 일정 수를 계산하지 못했습니다."
                  : `삭제될 일정: ${impactDeleteCount}건`}
              </p>
              {impactStatus === "미정" ? (
                <p>미정은 기존 일정 삭제만 수행되고 새 일정은 저장되지 않습니다.</p>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => void onConfirmImpactSubmit()}
            >
              {impactStatus === "미정" ? "삭제 후 적용" : "삭제 후 저장"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isSubmitting}
              onClick={() => setDeleteConfirmOpen(false)}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => void onConfirmDelete()}
            >
              {isSubmitting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
