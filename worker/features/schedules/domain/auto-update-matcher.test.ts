import { describe, expect, it } from "vitest";
import {
  buildBroadcastSessions,
  getTitleSimilarity,
  matchBroadcastSessions,
  type AutoUpdateSchedule,
  type BroadcastObservation,
} from "./auto-update-matcher";

const at = (value: string) => Date.parse(value);

const observation = (
  vodId: string,
  startedAt: string,
  endedAt: string,
  overrides: Partial<BroadcastObservation> = {},
): BroadcastObservation => ({
  vodId,
  memberUid: 1,
  memberName: "테스트 멤버",
  title: `방송 ${vodId}`,
  startedAt: at(startedAt),
  endedAt: at(endedAt),
  durationSeconds: Math.max(
    0,
    (at(endedAt) - at(startedAt)) / 1000,
  ),
  thumbnailUrl: null,
  ...overrides,
});

const schedule = (
  id: number,
  startTime: string | null,
  title: string | null,
  overrides: Partial<AutoUpdateSchedule> = {},
): AutoUpdateSchedule => ({
  id,
  memberUid: 1,
  date: "2026-07-28",
  startTime,
  title,
  status: "방송",
  ...overrides,
});

describe("buildBroadcastSessions", () => {
  it("46초와 35분 뒤 재개한 VOD를 같은 방송 세션으로 합친다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:first",
        "2026-07-28T06:02:29.000Z",
        "2026-07-28T08:17:04.000Z",
        { title: "첫 방송" },
      ),
      observation(
        "chzzk:resume-46s",
        "2026-07-28T08:17:50.000Z",
        "2026-07-28T10:29:06.000Z",
        { title: "재개 방송" },
      ),
      observation(
        "chzzk:resume-35m",
        "2026-07-28T11:04:00.000Z",
        "2026-07-28T12:04:00.000Z",
        { title: "두 번째 재개" },
      ),
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      vodId: "chzzk:first",
      date: "2026-07-28",
      startTime: "15:02",
      segmentCount: 3,
      sourceVodIds: [
        "chzzk:first",
        "chzzk:resume-46s",
        "chzzk:resume-35m",
      ],
    });
    expect(sessions[0].title).toBe("첫 방송");
  });

  it("2시간 41분 간격의 방송과 자정 뒤 60분 이내 재개를 구분한다", () => {
    const separate = buildBroadcastSessions([
      observation(
        "chzzk:afternoon",
        "2026-07-25T05:57:00.000Z",
        "2026-07-25T07:43:00.000Z",
      ),
      observation(
        "chzzk:evening",
        "2026-07-25T10:24:00.000Z",
        "2026-07-25T15:11:00.000Z",
      ),
    ]);
    expect(separate).toHaveLength(2);

    const acrossMidnight = buildBroadcastSessions([
      observation(
        "chzzk:before-midnight",
        "2026-07-28T14:30:00.000Z",
        "2026-07-28T15:10:00.000Z",
      ),
      observation(
        "chzzk:after-midnight",
        "2026-07-28T15:40:00.000Z",
        "2026-07-28T16:40:00.000Z",
      ),
    ]);
    expect(acrossMidnight).toHaveLength(1);
    expect(acrossMidnight[0]).toMatchObject({
      date: "2026-07-28",
      startTime: "23:30",
      segmentCount: 2,
    });
  });
});

describe("matchBroadcastSessions", () => {
  it("로컬 18개 VOD 회귀 형태를 16개 세션·15개 기존 일정·단기 억제 1건으로 분류한다", () => {
    const observations = [
      observation(
        "chzzk:resume-46-first",
        "2026-07-28T01:00:00.000Z",
        "2026-07-28T02:00:00.000Z",
        { memberUid: 1, title: "멤버 1 정규 방송" },
      ),
      observation(
        "chzzk:resume-46-second",
        "2026-07-28T02:00:46.000Z",
        "2026-07-28T03:00:00.000Z",
        { memberUid: 1, title: "멤버 1 재개 방송" },
      ),
      observation(
        "chzzk:resume-35-first",
        "2026-07-28T03:00:00.000Z",
        "2026-07-28T04:00:00.000Z",
        { memberUid: 2, title: "멤버 2 정규 방송" },
      ),
      observation(
        "chzzk:resume-35-second",
        "2026-07-28T04:35:00.000Z",
        "2026-07-28T05:40:00.000Z",
        { memberUid: 2, title: "멤버 2 재개 방송" },
      ),
      observation(
        "chzzk:late-39-regression",
        "2026-07-28T06:39:00.000Z",
        "2026-07-28T08:00:00.000Z",
        { memberUid: 3, title: "멤버 3 실제 방송" },
      ),
      observation(
        "chzzk:multi-first",
        "2026-07-28T09:00:00.000Z",
        "2026-07-28T10:00:00.000Z",
        { memberUid: 4, title: "멤버 4 낮 방송" },
      ),
      observation(
        "chzzk:multi-second",
        "2026-07-28T12:41:00.000Z",
        "2026-07-28T14:00:00.000Z",
        { memberUid: 4, title: "멤버 4 밤 방송" },
      ),
      observation(
        "chzzk:complete-day-main",
        "2026-07-28T05:05:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { memberUid: 5, title: "멤버 5 정규 방송" },
      ),
      observation(
        "chzzk:short-seven-minutes",
        "2026-07-28T11:00:00.000Z",
        "2026-07-28T11:07:00.000Z",
        { memberUid: 5, title: "짧은 테스트 기록" },
      ),
      ...Array.from({ length: 9 }, (_, index) => {
        const memberUid = index + 6;
        const hour = index;
        return observation(
          `chzzk:ordinary-${memberUid}`,
          `2026-07-28T${hour.toString().padStart(2, "0")}:10:00.000Z`,
          `2026-07-28T${(hour + 1).toString().padStart(2, "0")}:10:00.000Z`,
          {
            memberUid,
            title: `멤버 ${memberUid} 정규 방송`,
          },
        );
      }),
    ];
    const schedules: AutoUpdateSchedule[] = [
      schedule(1, "10:00", "멤버 1 정규 방송", { memberUid: 1 }),
      schedule(2, "12:00", "멤버 2 정규 방송", { memberUid: 2 }),
      schedule(3, "15:00", "멤버 3 예정 방송", { memberUid: 3 }),
      schedule(4, "18:00", "멤버 4 낮 방송", { memberUid: 4 }),
      schedule(5, "22:00", "멤버 4 밤 방송", { memberUid: 4 }),
      schedule(6, "14:00", "멤버 5 정규 방송", { memberUid: 5 }),
      ...Array.from({ length: 9 }, (_, index) => {
        const memberUid = index + 6;
        return schedule(
          memberUid + 1,
          `${(index + 9).toString().padStart(2, "0")}:10`,
          `멤버 ${memberUid} 정규 방송`,
          { memberUid },
        );
      }),
    ];

    const sessions = buildBroadcastSessions(observations);
    const decisions = matchBroadcastSessions(sessions, schedules);

    expect(observations).toHaveLength(18);
    expect(sessions).toHaveLength(16);
    expect(
      sessions.reduce(
        (total, session) => total + Math.max(0, session.segmentCount - 1),
        0,
      ),
    ).toBe(2);
    expect(decisions.filter((decision) => decision.kind === "existing")).toHaveLength(
      15,
    );
    expect(decisions.filter((decision) => decision.kind === "candidate")).toEqual(
      [],
    );
    expect(
      decisions.filter(
        (decision) =>
          decision.kind === "suppressed" &&
          decision.reason === "short_suppressed",
      ),
    ).toHaveLength(1);
  });

  it("39분 늦은 방송과 제목이 강하게 일치하는 장시간 지연 방송을 기존 일정으로 판정한다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:late-39",
        "2026-07-28T08:39:00.000Z",
        "2026-07-28T10:00:00.000Z",
        { title: "전혀 다른 실제 방송 제목" },
      ),
      observation(
        "chzzk:title-match",
        "2026-07-28T12:30:00.000Z",
        "2026-07-28T14:00:00.000Z",
        { title: "오늘의 특별 노래 방송입니다" },
      ),
    ]);
    const decisions = matchBroadcastSessions(sessions, [
      schedule(1, "17:00", "게임"),
      schedule(2, "19:00", "특별 노래 방송"),
    ]);

    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "existing",
        scheduleId: 1,
        reason: "time_window",
        confidence: "medium",
      }),
      expect.objectContaining({
        kind: "existing",
        scheduleId: 2,
        reason: "title_similarity",
      }),
    ]);
  });

  it("시간·제목의 빈 필드만 보완 대상으로 제안한다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:missing-title",
        "2026-07-28T06:10:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { title: "제목 채우기" },
      ),
      observation(
        "chzzk:missing-time",
        "2026-07-28T10:05:00.000Z",
        "2026-07-28T11:00:00.000Z",
        { title: "저녁 노래 방송" },
      ),
    ]);
    const decisions = matchBroadcastSessions(sessions, [
      schedule(1, "15:00", null),
      schedule(2, null, "저녁 노래 방송"),
    ]);

    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "candidate",
        candidateKind: "fill_missing_fields",
        scheduleId: 1,
        missingFields: ["title"],
      }),
      expect.objectContaining({
        kind: "candidate",
        candidateKind: "fill_missing_fields",
        scheduleId: 2,
        missingFields: ["time"],
      }),
    ]);
  });

  it("완성 일정보다 더 가까운 빈 일정이 있으면 빈 일정 보완을 우선한다", () => {
    const [session] = buildBroadcastSessions([
      observation(
        "chzzk:prefer-gap",
        "2026-07-28T06:05:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { title: "실제 방송 제목" },
      ),
    ]);
    const [decision] = matchBroadcastSessions([session], [
      schedule(1, "15:50", "완성된 다른 일정"),
      schedule(2, "15:00", null),
    ]);

    expect(decision).toMatchObject({
      kind: "candidate",
      candidateKind: "fill_missing_fields",
      scheduleId: 2,
      reason: "time_window",
      missingFields: ["title"],
    });
  });

  it("유일한 완전 빈 일정은 단일 남은 세션과 연결한다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:single",
        "2026-07-28T06:00:00.000Z",
        "2026-07-28T07:00:00.000Z",
      ),
    ]);
    const [decision] = matchBroadcastSessions(sessions, [
      schedule(1, null, null),
    ]);
    expect(decision).toMatchObject({
      kind: "candidate",
      scheduleId: 1,
      reason: "single_gap_fallback",
      missingFields: ["time", "title"],
    });
  });

  it("일부 필드만 빈 일정은 시간·제목 근거 없이 fallback 연결하지 않는다", () => {
    const [session] = buildBroadcastSessions([
      observation(
        "chzzk:no-partial-fallback",
        "2026-07-28T06:00:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { title: "관련 없는 방송" },
      ),
    ]);
    const [decision] = matchBroadcastSessions([session], [
      schedule(1, "00:00", null),
    ]);

    expect(decision).toMatchObject({
      kind: "candidate",
      candidateKind: "missing_schedule",
      scheduleId: null,
    });
  });

  it("게릴라 일정은 자동 매칭 대상으로 사용하지 않고 신규 후보로 유지한다", () => {
    const [session] = buildBroadcastSessions([
      observation(
        "chzzk:guerrilla",
        "2026-07-28T10:05:00.000Z",
        "2026-07-28T11:30:00.000Z",
        { title: "실제 게릴라 방송" },
      ),
    ]);

    const [decision] = matchBroadcastSessions([session], [
      schedule(1, "19:00", "게릴라", { status: "게릴라" }),
    ]);

    expect(decision).toMatchObject({
      kind: "candidate",
      candidateKind: "missing_schedule",
      scheduleId: null,
      reason: "missing_schedule",
    });
  });

  it("동률인 복수 빈 일정은 관리자 선택이 필요한 ambiguous 후보로 남긴다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:ambiguous",
        "2026-07-28T06:00:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { title: "동일 제목" },
      ),
    ]);
    const [decision] = matchBroadcastSessions(sessions, [
      schedule(1, null, "동일 제목"),
      schedule(2, null, "동일 제목"),
    ]);
    expect(decision).toMatchObject({
      kind: "candidate",
      candidateKind: "ambiguous",
      scheduleId: null,
      reason: "ambiguous",
      confidence: "low",
    });
    if (decision.kind === "candidate") {
      expect(decision.rankedSchedules.map((item) => item.scheduleId)).toEqual([
        1, 2,
      ]);
    }
  });

  it("제목 유사도 기준을 넘는 일정이 복수면 점수가 달라도 ambiguous로 남긴다", () => {
    const [session] = buildBroadcastSessions([
      observation(
        "chzzk:ambiguous-title",
        "2026-07-28T06:00:00.000Z",
        "2026-07-28T07:00:00.000Z",
        { title: "오늘의 특별 노래 방송" },
      ),
    ]);
    const [decision] = matchBroadcastSessions([session], [
      schedule(1, null, "오늘의 특별 노래 방송"),
      schedule(2, null, "특별 노래 방송"),
    ]);

    expect(decision).toMatchObject({
      kind: "candidate",
      candidateKind: "ambiguous",
      scheduleId: null,
      reason: "ambiguous",
    });
  });

  it("휴방일은 전부 제외하고 10분 미만 기록은 완성 일정이 있을 때만 제외한다", () => {
    const shortSession = buildBroadcastSessions([
      observation(
        "chzzk:short",
        "2026-07-28T03:37:00.000Z",
        "2026-07-28T03:44:00.000Z",
      ),
    ])[0];

    expect(
      matchBroadcastSessions([shortSession], [
        schedule(1, null, "휴방", { status: "휴방" }),
      ])[0],
    ).toMatchObject({
      kind: "suppressed",
      reason: "holiday_suppressed",
    });
    expect(
      matchBroadcastSessions([shortSession], [
        schedule(1, "19:00", "저녁 방송"),
      ])[0],
    ).toMatchObject({
      kind: "suppressed",
      reason: "short_suppressed",
    });
    expect(matchBroadcastSessions([shortSession], [])[0]).toMatchObject({
      kind: "candidate",
      candidateKind: "missing_schedule",
    });
  });

  it("완성 일정이 있는 날의 10분 미만 기록은 빈 일정과 매칭되더라도 제외한다", () => {
    const shortSession = buildBroadcastSessions([
      observation(
        "chzzk:short-title-match",
        "2026-07-28T03:37:00.000Z",
        "2026-07-28T03:44:00.000Z",
        { title: "짧은 방송" },
      ),
    ])[0];

    expect(
      matchBroadcastSessions([shortSession], [
        schedule(1, "19:00", "저녁 정규 방송"),
        schedule(2, null, "짧은 방송"),
      ])[0],
    ).toMatchObject({
      kind: "suppressed",
      reason: "short_suppressed",
    });
  });

  it("전역 일대일 매칭은 가능한 세션 수를 최대로 유지한다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:only-first-slot",
        "2026-07-28T00:01:00.000Z",
        "2026-07-28T00:31:00.000Z",
      ),
      observation(
        "chzzk:either-slot",
        "2026-07-28T01:52:00.000Z",
        "2026-07-28T02:22:00.000Z",
      ),
    ]);

    const decisions = matchBroadcastSessions(sessions, [
      schedule(1, "10:00", "첫 일정"),
      schedule(2, "11:50", "두 번째 일정"),
    ]);

    expect(decisions).toHaveLength(2);
    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "existing",
        scheduleId: 1,
      }),
      expect.objectContaining({
        kind: "existing",
        scheduleId: 2,
      }),
    ]);
  });

  it("완성 일정과 분리된 장시간 독립 방송은 새 일정 후보로 유지한다", () => {
    const sessions = buildBroadcastSessions([
      observation(
        "chzzk:planned",
        "2026-07-28T06:00:00.000Z",
        "2026-07-28T07:00:00.000Z",
      ),
      observation(
        "chzzk:extra",
        "2026-07-28T10:00:00.000Z",
        "2026-07-28T12:00:00.000Z",
      ),
    ]);
    const decisions = matchBroadcastSessions(sessions, [
      schedule(1, "15:00", "방송 chzzk:planned"),
    ]);
    expect(decisions[0]).toMatchObject({ kind: "existing", scheduleId: 1 });
    expect(decisions[1]).toMatchObject({
      kind: "candidate",
      candidateKind: "missing_schedule",
      reason: "missing_schedule",
    });
  });
});

describe("getTitleSimilarity", () => {
  it("문장 부호와 공백을 제거하고 포함 제목을 강하게 매칭한다", () => {
    expect(
      getTitleSimilarity(
        "특별 노래 방송",
        "오늘의 특별 노래 방송입니다! 💛",
      ),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("4자 미만의 짧은 한국어 제목도 포함 관계면 강하게 매칭한다", () => {
    expect(getTitleSimilarity("잡담", "오늘 잡담 방송")).toBeGreaterThanOrEqual(
      0.9,
    );
  });
});
