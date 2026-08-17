export const AUTO_UPDATE_RESUME_GAP_MS = 60 * 60 * 1000;
export const AUTO_UPDATE_TIME_WINDOW_MINUTES = 60;
export const AUTO_UPDATE_SHORT_SESSION_SECONDS = 10 * 60;
export const AUTO_UPDATE_TITLE_DICE_THRESHOLD = 0.6;

export type AutoUpdateCandidateKind =
  | "missing_schedule"
  | "fill_missing_fields"
  | "ambiguous";

export type AutoUpdateMatchReason =
  | "time_window"
  | "title_similarity"
  | "single_gap_fallback"
  | "missing_schedule"
  | "ambiguous"
  | "holiday_suppressed"
  | "short_suppressed";

export type AutoUpdateMatchConfidence = "high" | "medium" | "low";
export type AutoUpdateMissingField = "time" | "title";

export type BroadcastObservation = {
  vodId: string;
  memberUid: number;
  memberName: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  thumbnailUrl: string | null;
};

export type BroadcastSession = {
  vodId: string;
  memberUid: number;
  memberName: string;
  date: string;
  startTime: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  thumbnailUrl: string | null;
  sourceVodIds: string[];
  segmentCount: number;
};

export type AutoUpdateSchedule = {
  id: number;
  memberUid: number;
  date: string;
  startTime: string | null;
  title: string | null;
  status: string;
};

export type RankedScheduleMatch = {
  scheduleId: number;
  reason: "time_window" | "title_similarity" | "single_gap_fallback";
  confidence: "high" | "medium";
  timeDifferenceMinutes: number | null;
  titleSimilarity: number;
};

export type AutoUpdateSessionDecision =
  | {
      kind: "existing";
      session: BroadcastSession;
      scheduleId: number;
      reason: "time_window" | "title_similarity";
      confidence: "high" | "medium";
    }
  | {
      kind: "candidate";
      session: BroadcastSession;
      candidateKind: AutoUpdateCandidateKind;
      scheduleId: number | null;
      reason: AutoUpdateMatchReason;
      confidence: AutoUpdateMatchConfidence;
      missingFields: AutoUpdateMissingField[];
      rankedSchedules: RankedScheduleMatch[];
    }
  | {
      kind: "suppressed";
      session: BroadcastSession;
      reason: "holiday_suppressed" | "short_suppressed";
    };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad2 = (value: number) => value.toString().padStart(2, "0");

const toKstParts = (timestamp: number) => {
  const shifted = new Date(timestamp + KST_OFFSET_MS);
  return {
    date: `${shifted.getUTCFullYear()}-${pad2(
      shifted.getUTCMonth() + 1,
    )}-${pad2(shifted.getUTCDate())}`,
    time: `${pad2(shifted.getUTCHours())}:${pad2(
      shifted.getUTCMinutes(),
    )}`,
  };
};

const hasText = (value: string | null | undefined) =>
  Boolean(value?.trim());

export const getMissingScheduleFields = (
  schedule: Pick<AutoUpdateSchedule, "startTime" | "title">,
): AutoUpdateMissingField[] => [
  ...(!hasText(schedule.startTime) ? (["time"] as const) : []),
  ...(!hasText(schedule.title) ? (["title"] as const) : []),
];

const parseTimeMinutes = (value: string | null) => {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export const normalizeScheduleTitle = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\p{P}\p{S}\s]+/gu, "");

const toBigrams = (value: string) => {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, index) =>
    value.slice(index, index + 2),
  );
};

export const getTitleSimilarity = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const normalizedLeft = normalizeScheduleTitle(left);
  const normalizedRight = normalizeScheduleTitle(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const shorter =
    normalizedLeft.length <= normalizedRight.length
      ? normalizedLeft
      : normalizedRight;
  const longer =
    normalizedLeft.length > normalizedRight.length
      ? normalizedLeft
      : normalizedRight;
  if (longer.includes(shorter)) return 0.9;

  const leftBigrams = toBigrams(normalizedLeft);
  const rightBigrams = toBigrams(normalizedRight);
  const rightCounts = new Map<string, number>();
  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }
  let intersections = 0;
  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;
    if (count <= 0) continue;
    intersections += 1;
    rightCounts.set(bigram, count - 1);
  }
  return (2 * intersections) / (leftBigrams.length + rightBigrams.length);
};

const getTimeDifferenceMinutes = (
  session: BroadcastSession,
  schedule: AutoUpdateSchedule,
) => {
  const sessionMinutes = parseTimeMinutes(session.startTime);
  const scheduleMinutes = parseTimeMinutes(schedule.startTime);
  if (sessionMinutes === null || scheduleMinutes === null) return null;
  return Math.abs(sessionMinutes - scheduleMinutes);
};

const toRankedMatch = (
  session: BroadcastSession,
  schedule: AutoUpdateSchedule,
): RankedScheduleMatch | null => {
  const timeDifferenceMinutes = getTimeDifferenceMinutes(session, schedule);
  const titleSimilarity = getTitleSimilarity(session.title, schedule.title);
  if (
    timeDifferenceMinutes !== null &&
    timeDifferenceMinutes <= AUTO_UPDATE_TIME_WINDOW_MINUTES
  ) {
    return {
      scheduleId: schedule.id,
      reason: "time_window",
      confidence: timeDifferenceMinutes <= 30 ? "high" : "medium",
      timeDifferenceMinutes,
      titleSimilarity,
    };
  }
  if (titleSimilarity >= AUTO_UPDATE_TITLE_DICE_THRESHOLD) {
    return {
      scheduleId: schedule.id,
      reason: "title_similarity",
      confidence: titleSimilarity >= 0.9 ? "high" : "medium",
      timeDifferenceMinutes,
      titleSimilarity,
    };
  }
  return null;
};

const compareRankedMatches = (
  left: RankedScheduleMatch,
  right: RankedScheduleMatch,
) => {
  const leftReason = left.reason === "time_window" ? 0 : 1;
  const rightReason = right.reason === "time_window" ? 0 : 1;
  if (leftReason !== rightReason) return leftReason - rightReason;
  if (left.reason === "time_window" && right.reason === "time_window") {
    return (
      (left.timeDifferenceMinutes ?? Number.MAX_SAFE_INTEGER) -
      (right.timeDifferenceMinutes ?? Number.MAX_SAFE_INTEGER)
    );
  }
  if (left.titleSimilarity !== right.titleSimilarity) {
    return right.titleSimilarity - left.titleSimilarity;
  }
  return left.scheduleId - right.scheduleId;
};

const hasAmbiguousTopMatch = (ranked: RankedScheduleMatch[]) => {
  const top = ranked[0];
  if (!top) return false;
  if (top.reason === "time_window") {
    return ranked.some(
      (match, index) =>
        index > 0 &&
        match.reason === "time_window" &&
        match.timeDifferenceMinutes === top.timeDifferenceMinutes,
    );
  }
  return ranked.filter((match) => match.reason === "title_similarity").length > 1;
};

const rankSchedules = (
  session: BroadcastSession,
  schedules: AutoUpdateSchedule[],
) =>
  schedules
    .map((schedule) => toRankedMatch(session, schedule))
    .filter((match): match is RankedScheduleMatch => match !== null)
    .sort(compareRankedMatches);

export const buildBroadcastSessions = (
  observations: BroadcastObservation[],
): BroadcastSession[] => {
  const sorted = observations
    .filter(
      (item) =>
        Number.isFinite(item.startedAt) &&
        Number.isFinite(item.endedAt) &&
        item.endedAt >= item.startedAt,
    )
    .toSorted(
      (left, right) =>
        left.memberUid - right.memberUid ||
        left.startedAt - right.startedAt ||
        left.vodId.localeCompare(right.vodId),
    );
  const grouped: BroadcastObservation[][] = [];

  for (const observation of sorted) {
    const current = grouped.at(-1);
    const currentEnd = current
      ? Math.max(...current.map((item) => item.endedAt))
      : null;
    if (
      current &&
      current[0].memberUid === observation.memberUid &&
      currentEnd !== null &&
      observation.startedAt <= currentEnd + AUTO_UPDATE_RESUME_GAP_MS
    ) {
      current.push(observation);
    } else {
      grouped.push([observation]);
    }
  }

  return grouped.map((segments) => {
    const ordered = segments.toSorted(
      (left, right) =>
        left.startedAt - right.startedAt ||
        left.vodId.localeCompare(right.vodId),
    );
    const representative = ordered.toSorted(
      (left, right) =>
        right.durationSeconds - left.durationSeconds ||
        left.startedAt - right.startedAt,
    )[0];
    const startedAt = ordered[0].startedAt;
    const endedAt = Math.max(...ordered.map((item) => item.endedAt));
    const kst = toKstParts(startedAt);
    return {
      vodId: ordered[0].vodId,
      memberUid: ordered[0].memberUid,
      memberName: ordered[0].memberName,
      date: kst.date,
      startTime: kst.time,
      title: representative.title,
      startedAt,
      endedAt,
      durationSeconds: ordered.reduce(
        (total, item) => total + Math.max(0, item.durationSeconds),
        0,
      ),
      thumbnailUrl: representative.thumbnailUrl,
      sourceVodIds: ordered.map((item) => item.vodId),
      segmentCount: ordered.length,
    };
  });
};

const keyFor = (memberUid: number, date: string) => `${memberUid}:${date}`;

const chooseUniqueAssignments = (
  sessions: BroadcastSession[],
  schedules: AutoUpdateSchedule[],
) => {
  const assignments = new Map<
    string,
    { schedule: AutoUpdateSchedule; match: RankedScheduleMatch }
  >();
  const ambiguousRankings = new Map<string, RankedScheduleMatch[]>();
  const rankedBySession = new Map<string, RankedScheduleMatch[]>();
  const scheduleById = new Map(
    schedules.map((schedule) => [schedule.id, schedule]),
  );

  for (const session of sessions) {
    const ranked = rankSchedules(session, schedules);
    if (hasAmbiguousTopMatch(ranked)) {
      ambiguousRankings.set(session.vodId, ranked);
      continue;
    }
    if (ranked.length > 0) {
      rankedBySession.set(session.vodId, ranked);
    }
  }

  const scheduleAssignments = new Map<
    number,
    { session: BroadcastSession; match: RankedScheduleMatch }
  >();
  const tryAssign = (
    session: BroadcastSession,
    visitedScheduleIds: Set<number>,
  ): boolean => {
    for (const match of rankedBySession.get(session.vodId) ?? []) {
      if (visitedScheduleIds.has(match.scheduleId)) continue;
      visitedScheduleIds.add(match.scheduleId);
      const current = scheduleAssignments.get(match.scheduleId);
      if (
        !current ||
        tryAssign(current.session, visitedScheduleIds)
      ) {
        scheduleAssignments.set(match.scheduleId, { session, match });
        return true;
      }
    }
    return false;
  };

  const assignableSessions = sessions
    .filter((session) => rankedBySession.has(session.vodId))
    .toSorted((left, right) => {
      const leftRanked = rankedBySession.get(left.vodId)!;
      const rightRanked = rankedBySession.get(right.vodId)!;
      return (
        leftRanked.length - rightRanked.length ||
        compareRankedMatches(leftRanked[0], rightRanked[0]) ||
        left.startedAt - right.startedAt ||
        left.vodId.localeCompare(right.vodId)
      );
    });

  for (const session of assignableSessions) {
    tryAssign(session, new Set());
  }

  for (const [scheduleId, assignment] of scheduleAssignments) {
    const schedule = scheduleById.get(scheduleId);
    if (!schedule) continue;
    assignments.set(assignment.session.vodId, {
      schedule,
      match: assignment.match,
    });
  }

  const usedScheduleIds = new Set(scheduleAssignments.keys());
  return { assignments, usedScheduleIds, ambiguousRankings };
};

export const matchBroadcastSessions = (
  sessions: BroadcastSession[],
  schedules: AutoUpdateSchedule[],
): AutoUpdateSessionDecision[] => {
  const schedulesByKey = new Map<string, AutoUpdateSchedule[]>();
  for (const schedule of schedules) {
    const key = keyFor(schedule.memberUid, schedule.date);
    schedulesByKey.set(key, [...(schedulesByKey.get(key) ?? []), schedule]);
  }
  const sessionsByKey = new Map<string, BroadcastSession[]>();
  for (const session of sessions) {
    const key = keyFor(session.memberUid, session.date);
    sessionsByKey.set(key, [...(sessionsByKey.get(key) ?? []), session]);
  }

  const decisions: AutoUpdateSessionDecision[] = [];
  for (const [key, daySessions] of sessionsByKey) {
    const daySchedules = schedulesByKey.get(key) ?? [];
    if (daySchedules.some((schedule) => schedule.status === "휴방")) {
      decisions.push(
        ...daySessions.map(
          (session): AutoUpdateSessionDecision => ({
            kind: "suppressed",
            session,
            reason: "holiday_suppressed",
          }),
        ),
      );
      continue;
    }

    const eligibleSchedules = daySchedules.filter((schedule) =>
      ["방송", "미정"].includes(schedule.status),
    );
    const completeSchedules = eligibleSchedules.filter(
      (schedule) => getMissingScheduleFields(schedule).length === 0,
    );
    const incompleteSchedules = eligibleSchedules.filter(
      (schedule) => getMissingScheduleFields(schedule).length > 0,
    );

    const shortSuppressedSessions =
      completeSchedules.length > 0
        ? daySessions.filter(
            (session) =>
              session.durationSeconds < AUTO_UPDATE_SHORT_SESSION_SECONDS,
          )
        : [];
    decisions.push(
      ...shortSuppressedSessions.map(
        (session): AutoUpdateSessionDecision => ({
          kind: "suppressed",
          session,
          reason: "short_suppressed",
        }),
      ),
    );
    const matchableSessions = daySessions.filter(
      (session) => !shortSuppressedSessions.includes(session),
    );

    const matched = chooseUniqueAssignments(
      matchableSessions,
      eligibleSchedules,
    );
    for (const [vodId, assignment] of matched.assignments) {
      const session = matchableSessions.find((item) => item.vodId === vodId)!;
      const missingFields = getMissingScheduleFields(assignment.schedule);
      if (missingFields.length === 0) {
        const reason =
          assignment.match.reason === "single_gap_fallback"
            ? "title_similarity"
            : assignment.match.reason;
        decisions.push({
          kind: "existing",
          session,
          scheduleId: assignment.schedule.id,
          reason,
          confidence: assignment.match.confidence,
        });
      } else {
        decisions.push({
          kind: "candidate",
          session,
          candidateKind: "fill_missing_fields",
          scheduleId: assignment.schedule.id,
          reason: assignment.match.reason,
          confidence: assignment.match.confidence,
          missingFields,
          rankedSchedules: rankSchedules(session, eligibleSchedules),
        });
      }
    }

    for (const session of matchableSessions) {
      const ranked = matched.ambiguousRankings.get(session.vodId);
      if (!ranked) continue;
      decisions.push({
        kind: "candidate",
        session,
        candidateKind: "ambiguous",
        scheduleId: null,
        reason: "ambiguous",
        confidence: "low",
        missingFields: [],
        rankedSchedules: ranked,
      });
    }

    const unassignedSessions = matchableSessions.filter(
      (session) =>
        !matched.assignments.has(session.vodId) &&
        !matched.ambiguousRankings.has(session.vodId),
    );
    const unassignedIncomplete = incompleteSchedules.filter(
      (schedule) => !matched.usedScheduleIds.has(schedule.id),
    );

    for (const session of unassignedSessions) {
      if (
        unassignedSessions.length === 1 &&
        unassignedIncomplete.length === 1 &&
        getMissingScheduleFields(unassignedIncomplete[0]).length === 2
      ) {
        const schedule = unassignedIncomplete[0];
        decisions.push({
          kind: "candidate",
          session,
          candidateKind: "fill_missing_fields",
          scheduleId: schedule.id,
          reason: "single_gap_fallback",
          confidence: "medium",
          missingFields: getMissingScheduleFields(schedule),
          rankedSchedules: [
            {
              scheduleId: schedule.id,
              reason: "single_gap_fallback",
              confidence: "medium",
              timeDifferenceMinutes: getTimeDifferenceMinutes(
                session,
                schedule,
              ),
              titleSimilarity: getTitleSimilarity(
                session.title,
                schedule.title,
              ),
            },
          ],
        });
        continue;
      }

      decisions.push({
        kind: "candidate",
        session,
        candidateKind: "missing_schedule",
        scheduleId: null,
        reason: "missing_schedule",
        confidence: "high",
        missingFields: ["time", "title"],
        rankedSchedules: [],
      });
    }
  }

  return decisions.toSorted(
    (left, right) =>
      left.session.startedAt - right.session.startedAt ||
      left.session.vodId.localeCompare(right.session.vodId),
  );
};
