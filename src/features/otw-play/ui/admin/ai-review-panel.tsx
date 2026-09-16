import { useAiReviewSession } from "./use-ai-review-session";
import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AI_REVIEW_FIELDS,
  isAiReviewPending,
  type AiReviewDto,
  type AiReviewField,
  type AiReviewRange,
  type AiReviewSuggestion,
  type AiReviewTarget,
} from "@contracts/otw-play-ai-review";
import {
  startAiReview,
  getAiReview,
  latestAiReview,
} from "../../api/ai-review";
import type { AiReviewForm } from "./ai-review-form";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const labels: Record<AiReviewField, string> = {
  song: "곡·원곡 가수",
  participants: "가창자·역할",
  classification: "영상 분류",
  participationType: "참여 형태",
  performanceTags: "영상 라벨",
  segment: "가창 구간",
  broadcastDate: "방송일·근거",
  originalUrl: "원본 방송 다시보기 링크",
  extent: "완곡 여부",
};
const statuses: Record<AiReviewDto["status"], string> = {
  queued: "분석 대기",
  running: "영상 분석 중",
  retry_wait: "재시도 대기",
  succeeded: "분석 완료",
  partial: "일부 분석 · 영상 확인 필요",
  failed: "분석 실패",
};
function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "미입력";
  if (typeof value === "string" || typeof value === "number") {
    const names: Record<string, string> = {
      original: "오리지널곡",
      cover: "커버곡",
      singing_clip: "노래 클립",
      official_mv: "공식 MV",
      official_video: "공식 영상",
      broadcast: "방송",
      vocal: "메인 보컬",
      featured_vocal: "피처링 보컬",
      chorus: "코러스",
      other: "기타",
      solo: "솔로",
      duet: "듀엣",
      group: "그룹",
      full: "완곡",
      partial: "일부 가창",
    };
    return names[String(value)] ?? String(value);
  }
  if (Array.isArray(value)) return value.map(describe).join(" · ");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.label === "string")
      return `${v.label}${v.participantRole ? ` (${describe(v.participantRole)})` : ""}`;
    if (typeof v.name === "string")
      return `${v.name}${v.role ? ` (${describe(v.role)})` : ""}`;
    return Object.entries(v)
      .filter(([k]) => !["subject", "existingSongId", "candidates", "alternateTitles"].includes(k))
      .map(([, v]) => describe(v))
      .join(" · ");
  }
  return "";
}
function describeCurrent(field: AiReviewField, value: unknown): string {
  if (Array.isArray(value) && field === "song") {
    const [id, title, artists, tags] = value;
    return describe([
      title || (id && id !== "__new" ? "기존 곡 연결됨" : "미입력"),
      artists,
      tags,
    ]);
  }
  if (Array.isArray(value) && field === "segment")
    return `${describe(value[0])}초 ~ ${describe(value[1])}초`;
  return describe(value);
}
export function AiReviewPanel({
  target,
  videoId,
  candidateKind,
  durationSeconds,
  initialRange,
  form,
  disabled = false,
  onSeek,
  compact = false,
  session,
}: {
  target: AiReviewTarget;
  videoId: string;
  candidateKind: "official_video" | "singing_clip";
  durationSeconds: number | null;
  initialRange?: AiReviewRange;
  form: AiReviewForm;
  disabled?: boolean;
  onSeek?: (seconds: number) => void;
  compact?: boolean;
  session?: ReturnType<typeof useAiReviewSession>;
}) {
  const client = useQueryClient();
  const localSession = useAiReviewSession(videoId);
  const { rangeEnabled, setRangeEnabled, start, setStart, end, setEnd, jobId, setJobId,
    launching, setLaunching, error, setError, selected, setSelected, songChoice, setSongChoice,
    generation, autoJob, appliedJob, initialized, previousScope } = session ?? localSession;
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setStart(String(initialRange?.startSeconds ?? 0));
    setEnd(String(initialRange?.endSeconds ?? durationSeconds ?? ""));
  }, [initialized, setStart, setEnd, initialRange, durationSeconds]);
  const range: AiReviewRange = rangeEnabled
    ? { startSeconds: Number(start), endSeconds: Number(end) }
    : null;
  const valid =
    !range ||
    (Number.isSafeInteger(range.startSeconds) &&
      Number.isSafeInteger(range.endSeconds) &&
      range.startSeconds >= 0 &&
      range.endSeconds > range.startSeconds &&
      durationSeconds !== null &&
      range.endSeconds <= durationSeconds);
  const scope = JSON.stringify([target, range]);
  useEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    generation.current++;
    setJobId(null);
    setSelected(null);
    setSongChoice("");
    setError(null);
    autoJob.current = null;
    appliedJob.current = null;
  }, [scope, previousScope, generation, autoJob, appliedJob, setJobId, setSelected, setSongChoice, setError]);
  useEffect(
    () => () => {
      if (!session) generation.current++;
    },
    [generation, session],
  );
  const recent = useQuery({
    queryKey: ["otw-play-ai-review-latest", scope],
    queryFn: () => latestAiReview({ target, range }),
    enabled: valid && !disabled,
    retry: false,
  });
  const id = jobId ?? recent.data?.data?.id;
  const job = useQuery({
    queryKey: ["otw-play-ai-review", id],
    queryFn: () => getAiReview(id!),
    enabled: Boolean(id) && !disabled,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.data && isAiReviewPending(q.state.data.data.status)
        ? 3000
        : false,
  });
  const data = job.data?.data ?? (jobId ? null : recent.data?.data);
  const result = data?.result;
  const apply = useCallback(
    (s: AiReviewSuggestion, field?: AiReviewField | "all") => {
      const copy = structuredClone(s);
      const classification = copy.values.classification;
      if (
        classification &&
        (classification.releaseType === "broadcast") !==
          (candidateKind === "singing_clip")
      )
        delete copy.values.classification;
      if (candidateKind !== "singing_clip") {
        delete copy.values.broadcastDate;
        delete copy.values.originalUrl;
        delete copy.values.extent;
      }
      if (
        songChoice &&
        copy.values.song &&
        copy.values.song.candidates.some((c) => c.id === songChoice)
      )
        copy.values.song.existingSongId = songChoice;
      form.receive(copy, field);
    },
    [form, candidateKind, songChoice],
  );
  useEffect(() => {
    if (
      disabled ||
      !data ||
      !result ||
      isAiReviewPending(data.status) ||
      appliedJob.current === data.id
    )
      return;
    appliedJob.current = data.id;
    if (result.songs.length === 1) {
      setSelected(0);
      if (autoJob.current === data.id) apply(result.songs[0]);
    }
  }, [data, result, apply, disabled, launching, appliedJob, autoJob, setSelected]);
  const launch = async (force: boolean) => {
    const ticket = ++generation.current;
    setLaunching(true);
    setError(null);
    form.begin();
    try {
      const r = await startAiReview({
        target,
        range,
        force,
        idempotencyKey: crypto.randomUUID(),
      });
      if (ticket !== generation.current) return;
      autoJob.current = r.data.id;
      appliedJob.current = null;
      client.setQueryData(["otw-play-ai-review", r.data.id], r);
      setJobId(r.data.id);
      setSelected(null);
      setSongChoice("");
    } catch (e) {
      if (ticket === generation.current)
        setError(e instanceof Error ? e.message : "분석에 실패했습니다.");
    } finally {
      if (ticket === generation.current) setLaunching(false);
    }
  };
  const suggestion = selected !== null ? result?.songs[selected] : null;
  const pending = launching || Boolean(data && isAiReviewPending(data.status));
  const unavailable = (field: AiReviewField) =>
    (candidateKind !== "singing_clip" &&
      ["broadcastDate", "originalUrl", "extent"].includes(field)) ||
    (field === "classification" &&
      Boolean(suggestion?.values.classification) &&
      (suggestion?.values.classification?.releaseType === "broadcast") !==
        (candidateKind === "singing_clip"));
  return (
    <section
      aria-label="AI 자동 채우기"
      className="space-y-2 rounded-lg border bg-muted/10 p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-semibold">AI 제안</span>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !valid || pending}
          onClick={() => void launch(false)}
        >
          AI로 자동 채우기
        </Button>
        {data && !pending && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !valid}
            onClick={() => void launch(true)}
          >
            재분석
          </Button>
        )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
        <input
          type="checkbox"
          checked={rangeEnabled}
          disabled={pending || disabled}
          onChange={(e) => setRangeEnabled(e.target.checked)}
        />
        지정 구간만 분석
      </label>
      {data && (
        <span role="status" className="rounded bg-muted px-2 py-1 text-xs">
          {statuses[data.status]}
        </span>
      )}
      </div>
      {rangeEnabled && (
        <div className="flex max-w-xs items-center gap-2">
          <Input
            aria-label="AI 분석 시작 초"
            type="number"
            value={start}
            disabled={pending || disabled}
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            aria-label="AI 분석 종료 초"
            type="number"
            value={end}
            disabled={pending || disabled}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      )}
      {!valid && (
        <p role="alert">영상 길이 안의 시작·종료 위치를 입력하세요.</p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2">자동 입력·적용 안내</summary>
        <p className="mt-1 leading-relaxed">새 분석은 미편집 항목만 자동 입력합니다. 기존 검수값·직접 수정한 값은 보호하며, 이전 결과는 자동 적용하지 않습니다. 일괄 적용은 기존 값을 바꾸며 되돌릴 수 있습니다. 저장은 별도로 진행하세요.</p>
      </details>
      {(error || recent.error || job.error) && (
        <p role="alert">{error ?? (recent.error ?? job.error)?.message}</p>
      )}
      {data && (data.errorMessage || data.nextRetryAt) && (
        <p role="status">
          {data.errorMessage}
          {data.nextRetryAt
            ? ` · ${new Date(data.nextRetryAt).toLocaleString("ko-KR")}`
            : ""}
        </p>
      )}
      {result?.warnings.map((w, i) => (
        <p key={i}>{w}</p>
      ))}
      {result && result.songs.length > 1 && (
        <label>
          적용할 곡·구간
          <select
            aria-label="AI 분석 곡 선택"
            value={selected ?? ""}
            onChange={(e) => {
              setSelected(
                e.target.value === "" ? null : Number(e.target.value),
              );
              setSongChoice("");
            }}
            className="block w-full rounded border bg-background p-2"
          >
            <option value="">곡을 선택하세요</option>
            {result.songs.map((s, i) => (
              <option key={i} value={i}>
                {s.values.song?.title ?? `곡 ${i + 1}`} ·{" "}
                {s.values.participants?.map((p) => p.name).join(", ")} ·{" "}
                {s.values.segment
                  ? `${s.values.segment.startSeconds}–${s.values.segment.endSeconds}초`
                  : "구간 미확인"}
              </option>
            ))}
          </select>
        </label>
      )}
      {suggestion && (
        <div className="space-y-2">
          {suggestion.values.song && (
            <p role="status" aria-label="AI 카탈로그 대조 결과" className="text-xs leading-relaxed text-muted-foreground">
              {suggestion.values.song.existingSongId
                ? `카탈로그 확인 완료 · 기존 곡: ${suggestion.values.song.title}. ${form.applied.includes("song") ? "폼에 연결했습니다." : "기존 곡 연결을 제안합니다."}`
                : suggestion.values.song.candidates.length > 0
                  ? `카탈로그 확인 완료 · 유사 표기 또는 동명곡 ${suggestion.values.song.candidates.length}개가 있습니다. 원곡 가수를 확인하고 아래에서 선택하세요.`
                  : "카탈로그 확인 완료 · 제목·별칭·원곡 가수가 일치하는 곡을 찾지 못했습니다. 새 곡 초안을 제안합니다."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled || pending}
            onClick={() => apply(suggestion, "all")}
          >
            AI 제안 일괄 적용
          </Button>
          <p role="status" className="text-xs text-muted-foreground">
            {form.applied.length > 0
              ? `${form.applied.length}개 항목에 AI 제안을 적용했습니다.`
              : "미적용 · 적용 시 기존 입력값을 바꿉니다."}
          </p>
          {form.applied.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={form.undo} disabled={disabled}>AI 입력 되돌리기</Button>
          )}
          </div>
          {(suggestion.values.participants?.some((p) => !p.subject) ||
            (suggestion.values.song &&
              !suggestion.values.song.existingSongId &&
              !songChoice &&
              (suggestion.values.song.candidates.length > 0 ||
                suggestion.values.song.originalArtists.some(
                  (p) => !p.subject,
                )))) && (
            <p className="text-xs text-muted-foreground">
              곡·인물 연결이 모호한 항목은 제외합니다. 기존 곡을 선택하거나
              폼에서 직접 확인하세요.
            </p>
          )}
          {suggestion.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {suggestion.values.classification &&
            (suggestion.values.classification.releaseType === "broadcast") !==
              (candidateKind === "singing_clip") && (
              <p role="alert">
                현재 영상 종류와 AI 분류가 다릅니다. 영상 종류를 정정한 뒤
                검수하세요.
              </p>
            )}
          {suggestion.values.song &&
            suggestion.values.song.candidates.length > 0 &&
            !suggestion.values.song.existingSongId && (
              <label>
                기존 곡 연결
                <select
                  aria-label="AI 기존 곡 선택"
                  value={songChoice}
                  onChange={(e) => setSongChoice(e.target.value)}
                  className="block w-full rounded border bg-background p-2"
                >
                  <option value="">동명곡·원곡 가수를 확인하세요</option>
                  {suggestion.values.song.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          <details open={compact ? undefined : true} className="rounded-md border">
          <summary className="cursor-pointer rounded-md px-3 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2">항목별 제안 · {Object.keys(suggestion.values).length}개 · 현재 값·근거 확인</summary>
          <div className="grid items-start gap-2 border-t p-2 sm:grid-cols-2">
          {AI_REVIEW_FIELDS.filter(
            (k) => suggestion.values[k] !== undefined,
          ).map((field) => (
            <details key={field} className="min-w-0 rounded border bg-background p-2">
              <summary className="cursor-pointer rounded text-xs leading-relaxed focus-visible:outline focus-visible:outline-2">
                <span className="font-medium">{labels[field]}</span>
                {unavailable(field)
                  ? " · 현재 영상 종류에서는 적용 제외"
                  : form.applied.includes(field)
                    ? " · AI 제안 적용됨"
                    : " · 제안 확인"}
                <span className="mt-1 block truncate text-muted-foreground" title={describe(suggestion.values[field])}>{describe(suggestion.values[field])}</span>
              </summary>
              <p className="mt-2 break-words text-xs leading-relaxed">
                현재: {describeCurrent(field, form.snapshots[field])}
              </p>
              <p className="break-words text-xs leading-relaxed">제안: {describe(suggestion.values[field])}</p>
              {suggestion.evidence[field]?.map((e, i) => (
                <p key={i} className="mt-1 text-xs">
                  {e.source}: {e.text}
                  {e.seconds !== null && (
                    <>
                      {onSeek ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="link"
                          onClick={() => onSeek(e.seconds!)}
                        >
                          {e.seconds}초 확인
                        </Button>
                      ) : (
                        <a
                          className="ml-2 underline"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(e.seconds)}s`}
                        >
                          {e.seconds}초 확인
                        </a>
                      )}
                    </>
                  )}
                </p>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || pending || unavailable(field)}
                onClick={() => apply(suggestion, field)}
              >
                이 항목 적용
              </Button>
            </details>
          ))}
          </div>
          </details>
          {result && result.songs.length > 1 && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                form.begin();
                apply(suggestion);
              }}
            >
              선택한 곡의 미편집 항목 채우기
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
