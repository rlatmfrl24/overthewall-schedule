import {
  roundTimeToNearestScheduleHalfHour,
  type PendingApprovalOptions,
  type PendingSchedule,
} from "@/features/schedules";

export type PendingApprovalDraft = PendingApprovalOptions & {
  draftValues?: PendingApprovalOptions["changes"];
};

export const getPendingScheduleSummaryById = (pending: PendingSchedule, id: number | null) =>
  id ? pending.same_day_schedules.find(schedule => schedule.id === id) ??
    (pending.existing_schedule?.id === id ? pending.existing_schedule : null) ??
    (pending.empty_target_schedule?.id === id ? pending.empty_target_schedule : null) : null;

const scheduleTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getPendingApprovalPreview(pending: PendingSchedule, options: PendingApprovalDraft) {
  const selectedExistingSchedule = options.targetMode === "update"
    ? getPendingScheduleSummaryById(pending, options.targetScheduleId ?? null) : null;
  const currentTitle = selectedExistingSchedule?.title ?? null;
  const currentStartTime = selectedExistingSchedule?.start_time ?? null;
  const currentStatus = selectedExistingSchedule?.status ?? null;
  const isV2 = pending.candidate_kind != null;
  const sourceTime = (options.timeMode === "exact" ? pending.start_time : roundTimeToNearestScheduleHalfHour(pending.start_time)) ?? "";
  const sourceTitle = pending.title?.trim();
  const defaultUpdateChanges = options.changes === undefined && isV2 && selectedExistingSchedule &&
    !pending.is_processed && pending.content_access !== "admin_archive" ? {
      ...(sourceTitle ? {title:sourceTitle} : {}),
      ...(scheduleTimePattern.test(sourceTime) ? {startTime:sourceTime} : {}),
    } : undefined;
  const changes = options.changes ?? defaultUpdateChanges;
  const expectedTarget = options.expectedTarget ?? (defaultUpdateChanges && selectedExistingSchedule ? {
    title:currentTitle, startTime:currentStartTime, status:selectedExistingSchedule.status,
  } : undefined);
  const manual = changes !== undefined;
  const appliesTitle = changes ? changes.title !== undefined : isV2
    ? options.targetMode === "create" || !currentTitle?.trim()
    : options.applyMode === "all" || options.applyMode === "title";
  const appliesTime = changes ? changes.startTime !== undefined : isV2
    ? options.targetMode === "create" || !currentStartTime?.trim()
    : options.applyMode === "all" || options.applyMode === "time";
  const appliesStatus = options.targetMode === "create" || (!manual && !isV2 && options.applyMode === "all");
  const titleInput = changes?.title ?? options.draftValues?.title ?? pending.title ?? "";
  const timeInput = changes?.startTime ?? options.draftValues?.startTime ?? sourceTime;
  const effectiveStartTime = appliesTime ? (manual || options.timeMode !== "exact"
    ? roundTimeToNearestScheduleHalfHour(timeInput) : timeInput) : null;
  const nextTitle = appliesTitle ? (manual ? titleInput.trim() : pending.title) : currentTitle;
  const nextStartTime = appliesTime ? effectiveStartTime : currentStartTime;
  const nextStatus = appliesStatus ? isV2 ? "방송" : pending.status : currentStatus;
  let error: string | null = !appliesTitle && !appliesTime ? "반영할 항목을 하나 이상 선택하세요." : null;
  if (manual) {
    if (!appliesTitle && !appliesTime) error = "반영할 항목을 하나 이상 선택하세요.";
    else if (appliesTitle && !titleInput.trim()) error = "반영할 제목을 입력해 주세요.";
    else if (appliesTime && !scheduleTimePattern.test(timeInput)) error = "방송 시간을 HH:mm 형식으로 입력해 주세요.";
    else if (options.targetMode === "update" && !selectedExistingSchedule) error = "수정할 기존 일정을 선택해 주세요.";
    else if (options.expectedTarget && (
      currentTitle !== options.expectedTarget.title || currentStartTime !== options.expectedTarget.startTime || currentStatus !== options.expectedTarget.status
    )) error = "기존 일정이 바뀌었습니다. 편집을 초기화한 뒤 다시 확인해 주세요.";
  }
  return {selectedExistingSchedule,currentTitle,currentStartTime,currentStatus,appliesTitle,appliesTime,appliesStatus,titleInput,timeInput,effectiveStartTime,nextTitle,nextStartTime,nextStatus,changes,expectedTarget,error};
}

export function editPendingApprovalField(
  pending: PendingSchedule,
  options: PendingApprovalDraft,
  field: "title" | "startTime",
  value: string | null,
): Pick<PendingApprovalDraft, "changes" | "expectedTarget" | "draftValues"> {
  const preview = getPendingApprovalPreview(pending, options);
  const draftValues = {...options.draftValues, ...options.changes};
  const changes = {...(preview.changes ?? {
    ...(preview.appliesTitle ? {title:preview.titleInput} : {}),
    ...(preview.appliesTime ? {startTime:preview.timeInput} : {}),
  })};
  if (value === null) delete changes[field];
  else {
    changes[field] = value;
    draftValues[field] = value;
  }
  const target = preview.selectedExistingSchedule;
  return {
    changes,
    draftValues,
    expectedTarget:options.targetMode === "update" && target ? preview.expectedTarget ?? {
      title:target.title ?? null,startTime:target.start_time ?? null,status:target.status,
    } : undefined,
  };
}
