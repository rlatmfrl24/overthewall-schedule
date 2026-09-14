import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";
import type { Member } from "@/features/members";
import { fetchSchedulesByDate } from "../api/schedules";
import type { ScheduleItem, ScheduleStatus } from "../model/schedule";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { ChevronDownIcon, Trash2 } from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Calendar } from "@/shared/ui/calendar";
import { Input } from "@/shared/ui/input";

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
const LEGACY_UNSCHEDULED_STATUS: ScheduleStatus = "미정";
const EXCLUSIVE_STATUSES: ScheduleStatus[] = ["휴방", "게릴라"];
const STATUS_OPTIONS: ScheduleStatus[] = ["방송", ...EXCLUSIVE_STATUSES];
const QUICK_TIME_PRESET_GROUPS = [
  {
    label: "낮 시간대",
    times: [
      "07:00",
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
    ] as const,
  },
  {
    label: "저녁 시간대",
    times: [
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
    ] as const,
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
  const [formBaseline, setFormBaseline] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [impactConfirmOpen, setImpactConfirmOpen] = useState(false);
  const [impactSchedules, setImpactSchedules] = useState<ScheduleItem[]>([]);
  const [formError, setFormError] = useState("");
  const statusDrafts = useRef<Partial<Record<ScheduleStatus, {
    title: string;
    isTimeUndecided: boolean;
    hour: string;
    minute: string;
  }>>>({});
  const [pendingSubmitData, setPendingSubmitData] =
    useState<ScheduleSubmitData | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImpactChecking, setIsImpactChecking] = useState(false);

  const isEditMode = Boolean(schedule);
  const isBusy = isSubmitting || isImpactChecking;
  const hasMemberError = hasAttemptedSubmit && memberUid === "";
  const isExclusiveStatus = (nextStatus: ScheduleStatus) =>
    EXCLUSIVE_STATUSES.includes(nextStatus);
  const canSubmit = memberUid !== "" && !isBusy;
  const currentTimeValue = `${startHour}:${startMinute}`;
  const formKey = JSON.stringify([memberUid, format(date, "yyyy-MM-dd"), status, isTimeUndecided, startHour, startMinute, title]);
  const canDiscard = useUnsavedChanges(isOpen && Boolean(formBaseline) && formKey !== formBaseline);

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

  const handleStatusChange = (nextStatus: ScheduleStatus) => {
    if (isBusy || nextStatus === status) return;

    statusDrafts.current[status] = {
      title, isTimeUndecided, hour: startHour, minute: startMinute,
    };
    const draft = statusDrafts.current[nextStatus];
    setTitle(draft?.title ?? (isExclusiveStatus(nextStatus) ? nextStatus : ""));
    setIsTimeUndecided(draft?.isTimeUndecided ?? true);
    applyTime(draft?.hour ?? DEFAULT_TIME.hour, draft?.minute ?? DEFAULT_TIME.minute);
    setStatus(nextStatus);
  };

  useEffect(() => {
    if (schedule) {
      const normalizedStatus =
        schedule.status === LEGACY_UNSCHEDULED_STATUS ? "방송" : schedule.status;

      setMemberUid(schedule.member_uid);
      setDate(new Date(schedule.date));
      setStatus(normalizedStatus);

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

      setTitle(
        schedule.status === LEGACY_UNSCHEDULED_STATUS ? "" : schedule.title || ""
      );
    } else if (isOpen) {
      // Initialize form when opening in "add" mode
      setMemberUid(initialMemberUid || "");
      setDate(initialDate ? new Date(initialDate) : new Date());
      setStatus("방송");
      setIsTimeUndecided(true);
      setLastDecidedTime(DEFAULT_TIME);
      applyTime(DEFAULT_TIME.hour, DEFAULT_TIME.minute, { remember: false });
      setTitle("");
    }
    if (isOpen) {
      const baseTime = schedule?.start_time ? parseTimeValue(schedule.start_time.slice(0, 5)) ?? DEFAULT_TIME : DEFAULT_TIME;
      setFormBaseline(JSON.stringify([
        schedule?.member_uid ?? (initialMemberUid || ""),
        format(schedule ? new Date(schedule.date) : initialDate ?? new Date(), "yyyy-MM-dd"),
        schedule && schedule.status !== LEGACY_UNSCHEDULED_STATUS ? schedule.status : "방송",
        !schedule?.start_time, baseTime.hour, baseTime.minute,
        schedule && schedule.status !== LEGACY_UNSCHEDULED_STATUS ? schedule.title || "" : "",
      ]));
      setHasAttemptedSubmit(false);
      setImpactConfirmOpen(false);
      setPendingSubmitData(null);
      setImpactSchedules([]);
      setFormError("");
      statusDrafts.current = {};
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

  const findConflicts = async (data: ScheduleSubmitData) => {
    const existing = await fetchSchedulesByDate(format(data.date, "yyyy-MM-dd"));
    // Match the save endpoint's conflict policy; other broadcasts can coexist.
    return existing.filter((item) =>
      item.member_uid === data.member_uid && item.id !== data.id &&
      (data.status !== "방송" || item.status !== "방송")
    );
  };

  const submitSchedule = async (data: ScheduleSubmitData) => {
    setIsSubmitting(true);
    setFormError("");
    try {
      await Promise.resolve(onSubmit(data));
      if (!controlledOpen) {
        setIsOpen(false);
      }
    } catch (error) {
      console.error(error);
      setFormError("스케쥴을 저장하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인한 뒤 다시 저장해주세요.");
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

    setFormError("");
    setIsImpactChecking(true);
    let conflicts: ScheduleItem[];
    try {
      conflicts = await findConflicts(submitData);
    } catch (error) {
      console.error("Failed to check schedule conflicts", error);
      setFormError("기존 일정의 영향을 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 조회해주세요.");
      return;
    } finally {
      setIsImpactChecking(false);
    }
    if (conflicts.length > 0 || isExclusiveStatus(submitData.status)) {
      setPendingSubmitData(submitData);
      setImpactSchedules(conflicts);
      setImpactConfirmOpen(true);
      return;
    }
    await submitSchedule(submitData);
  };

  const onConfirmImpactSubmit = async () => {
    if (!pendingSubmitData || isBusy) return;
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

  const handleDialogOpenChange = async (nextOpen: boolean) => {
    if (isBusy || (!nextOpen && !await canDiscard())) return;
    setIsOpen(nextOpen);
  };

  const impactStatus = pendingSubmitData?.status;
  const impactMemberName =
    members.find((member) => member.uid === pendingSubmitData?.member_uid)?.name ||
    (pendingSubmitData ? `UID ${pendingSubmitData.member_uid}` : "");
  const impactDateLabel = pendingSubmitData?.date.toLocaleDateString("ko-KR");
  const dialogDescription = isEditMode
    ? "기존 스케쥴을 수정합니다. 삭제가 필요하면 하단 삭제 버튼을 사용하세요."
    : "새 스케쥴을 추가합니다.";
  const submitLabel = isImpactChecking
    ? "영향 계산 중..."
    : isSubmitting
      ? "저장 중..."
      : isEditMode
        ? "수정 저장"
        : "스케쥴 추가";

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent closeLabel="닫기" className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-4 sm:max-w-xl sm:p-5">
        <DialogHeader className="text-left pr-6">
          <DialogTitle>{isEditMode ? "스케쥴 수정" : "스케쥴 추가"}</DialogTitle>
          <DialogDescription className="sr-only">{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} aria-busy={isBusy}>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-2">
                <FieldLabel htmlFor="schedule-member">멤버</FieldLabel>
                <Select
                  disabled={isBusy}
                  value={memberUid.toString()}
                  onValueChange={(value) => setMemberUid(Number(value))}
                >
                  <SelectTrigger className="h-11 sm:h-9" id="schedule-member" aria-required="true" aria-invalid={hasMemberError} aria-describedby={hasMemberError ? "schedule-member-error" : memberUid === "" ? "schedule-member-hint" : undefined}>
                    <SelectValue placeholder="멤버 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {members.map((member) => (
                        <SelectItem
                          key={member.uid}
                          value={member.uid.toString()}
                        >
                          {member.oshi_mark && <span aria-hidden="true">{member.oshi_mark} </span>}{member.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {memberUid === "" && <FieldDescription className="text-xs" id="schedule-member-hint">멤버를 선택하면 스케쥴을 추가할 수 있어요.</FieldDescription>}
                <FieldError id="schedule-member-error">{hasMemberError ? "멤버를 선택해주세요." : null}</FieldError>
              </Field>
              <Field className="gap-2">
                <FieldLabel htmlFor="date">날짜</FieldLabel>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      id="date"
                      disabled={isBusy}
                      className={cn(
                        "h-11 w-full justify-between text-left font-normal sm:h-9",
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
            </div>
            <Field className="gap-2">
              <FieldLabel>상태</FieldLabel>
              <div
                role="group"
                aria-label="스케쥴 상태"
                className="grid w-full grid-cols-3 gap-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    disabled={isBusy}
                    variant={status === option ? "default" : "outline"}
                    aria-pressed={status === option}
                    className="h-11 justify-center sm:h-9"
                    onClick={() => handleStatusChange(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="schedule-title">제목</FieldLabel>
              <Input
                id="schedule-title"
                className="h-11 sm:h-9"
                disabled={isBusy}
                value={title}
                placeholder="방송 내용을 입력해주세요"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            {status === "방송" && (
              <Field className="gap-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>시간</FieldLabel>
                  <div className="flex min-h-8 items-center gap-2">
                  <Checkbox
                    id="time-undecided"
                    disabled={isBusy}
                    checked={isTimeUndecided}
                    onCheckedChange={(checked) => {
                      const undecided = checked === true;
                      setIsTimeUndecided(undecided);
                      if (undecided) {
                        setLastDecidedTime({ hour: startHour, minute: startMinute });
                      } else {
                        applyTime(lastDecidedTime.hour, lastDecidedTime.minute);
                      }
                    }}
                  />
                  <label htmlFor="time-undecided" className="cursor-pointer text-sm">시간 미정</label>
                  </div>
                </div>
                {isTimeUndecided ? (
                  <FieldDescription className="text-xs">아직 정해지지 않았어요. 시간 없이 등록할 수 있어요.</FieldDescription>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="schedule-time" className="sr-only">방송 시작 시간</label>
                    <Input id="schedule-time" className="h-11 sm:h-9" type="time" disabled={isBusy}
                      value={currentTimeValue}
                      onChange={(e) => {
                        const parsed = parseTimeValue(e.target.value);
                        if (parsed) applyTime(parsed.hour, parsed.minute);
                      }} />
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="text-xs font-medium text-muted-foreground">빠른 시간 선택</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {QUICK_TIME_PRESET_GROUPS.map((group) => (
                      <div key={group.label} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">{group.label}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {group.times.map((preset) => (
                            <Button key={preset} type="button" size="sm"
                              className="w-full justify-center px-1"
                              variant={!isTimeUndecided && preset === currentTimeValue ? "default" : "outline"}
                              aria-pressed={!isTimeUndecided && preset === currentTimeValue}
                              disabled={isBusy}
                              onClick={() => {
                                const parsed = parseTimeValue(preset);
                                if (!parsed) return;
                                setIsTimeUndecided(false);
                                applyTime(parsed.hour, parsed.minute);
                              }}>{preset}</Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Field>
            )}
            {formError && (
              <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive space-y-2">
                <p>{formError}</p>
                <Button type="submit" variant="outline" disabled={!canSubmit}>다시 조회하고 저장</Button>
              </div>
            )}
            <DialogFooter className="sticky -bottom-4 flex-col gap-2 bg-background pt-2 sm:-bottom-5 sm:flex-row sm:items-center sm:justify-end">
              {isEditMode && onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 sm:mr-auto sm:h-9"
                  disabled={isBusy}
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  스케쥴 삭제
                </Button>
              ) : null}
              <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 sm:h-9 sm:flex-none"
                  disabled={isBusy}
                  onClick={() => handleDialogOpenChange(false)}
                >
                  취소
                </Button>
                <Button type="submit" className="h-11 flex-[2] sm:h-9 sm:flex-none" disabled={!canSubmit}>
                  {submitLabel}
                </Button>
              </div>
            </DialogFooter>
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

      <ConfirmActionDialog open={impactConfirmOpen}
        onOpenChange={(open) => { setImpactConfirmOpen(open); if (!open) setPendingSubmitData(null); }}
        title={impactSchedules.length ? `기존 일정 ${impactSchedules.length}건 삭제 확인` : "스케쥴 저장 확인"}
        confirmLabel={impactSchedules.length ? "삭제 후 저장" : `${impactStatus ?? "일정"} 저장`}
        destructive={impactSchedules.length > 0} isProcessing={isSubmitting}
        onConfirm={() => void onConfirmImpactSubmit()}
        description={<div className="space-y-2">
          <p><strong>{impactMemberName}</strong> · <strong>{impactDateLabel}</strong></p>
          {impactSchedules.length ? <>
            <p>{impactStatus} 일정으로 저장하면 아래 일정이 삭제됩니다.</p>
            <ul className="max-h-48 overflow-y-auto list-disc pl-5 space-y-1">
              {impactSchedules.map((item) => <li key={item.id}>
                {item.start_time?.slice(0, 5) ?? "시간 미정"} · {item.title || item.status} ({item.status})
              </li>)}
            </ul>
          </> : <p>기존 일정 변경 없음 · {impactStatus} 일정을 저장합니다.</p>}
        </div>} />
      <ConfirmActionDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}
        title="삭제 확인" description="이 스케쥴을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다."
        confirmLabel="삭제" destructive isProcessing={isSubmitting} onConfirm={() => void onConfirmDelete()} />
    </Dialog>
  );
};
