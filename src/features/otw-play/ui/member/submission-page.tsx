import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import type {
  OtwPlaySubmissionPreflightDto,
  OtwPlaySubmissionSubjectInput,
} from "@contracts/otw-play";
import { fetchActiveMembers } from "@/features/members";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  createOtwPlaySubmission,
  preflightOtwPlaySubmission,
} from "../../api/submissions";

const steps = ["영상 확인", "곡과 참여자", "검토·제출"];

const newClientRequestId = () => crypto.randomUUID();

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const normalized = draft.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (normalized && !values.includes(normalized)) onChange([...values, normalized]);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    }
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex min-h-11 flex-wrap gap-2 rounded-md border bg-background p-2">
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1 py-1">
            {value}
            <button
              type="button"
              aria-label={`${value} 제거`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-36 flex-1 bg-transparent px-1 text-sm outline-none"
        />
      </div>
    </div>
  );
}

export function OtwPlaySubmissionPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [suggestedSongId, setSuggestedSongId] = useState<string | null>(null);
  const [originalArtists, setOriginalArtists] = useState<string[]>([]);
  const [memberUids, setMemberUids] = useState<number[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [preflight, setPreflight] = useState<OtwPlaySubmissionPreflightDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const members = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
  });
  const preflightMutation = useMutation({
    mutationFn: preflightOtwPlaySubmission,
    onSuccess: (data) => {
      setPreflight(data);
      setMessage(null);
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? error.message : "영상 확인에 실패했습니다.");
    },
  });
  const submitMutation = useMutation({
    mutationFn: createOtwPlaySubmission,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.memberSubmissions(),
      });
      setStep(0);
      setClientRequestId(newClientRequestId());
      setYoutubeUrl("");
      setTitle("");
      setSuggestedSongId(null);
      setOriginalArtists([]);
      setMemberUids([]);
      setExternalParticipants([]);
      setNote("");
      setPreflight(null);
      setMessage("곡 제안이 접수되었습니다. 내 제안에서 검수 상태를 확인할 수 있습니다.");
    },
    onError: (error) => {
      const apiError = error instanceof ApiError ? error : null;
      setMessage(
        apiError?.code === "PLAY_SUBMISSION_DUPLICATE"
          ? "이미 카탈로그에 있거나 검토 중인 영상입니다."
          : apiError?.code === "PLAY_SUBMISSION_RATE_LIMITED"
            ? "제안 횟수 제한에 도달했습니다. 잠시 후 다시 시도해 주세요."
            : apiError?.message ?? "제안 제출에 실패했습니다.",
      );
    },
  });

  const participants = useMemo<OtwPlaySubmissionSubjectInput[]>(
    () => [
      ...memberUids.map((memberUid) => ({ kind: "member" as const, memberUid })),
      ...externalParticipants.map((displayName) => ({
        kind: "external" as const,
        displayName,
      })),
    ],
    [externalParticipants, memberUids],
  );

  const verifyVideo = async () => {
    const data = await preflightMutation.mutateAsync({ youtubeUrl }).catch(() => null);
    if (data && !data.duplicate) setStep(1);
  };
  const searchSongCandidates = () =>
    preflightMutation.mutate({ youtubeUrl, title });
  const canReview =
    title.trim().length > 0 && originalArtists.length > 0 && participants.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-8 sm:p-8">
      <div>
        <p className="text-sm font-medium text-primary">회원 공식 커버 제안</p>
        <h1 className="mt-1 text-2xl font-bold">공식 커버 영상을 알려주세요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          제출 내용은 비공개로 검수하며 승인 전에는 공개 카탈로그에 표시되지 않습니다.
        </p>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label="제안 단계">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={`rounded-lg border px-3 py-2 text-center text-xs font-medium sm:text-sm ${
              step === index ? "border-foreground bg-foreground text-background" : "bg-card"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {step === 0 ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="submission-youtube-url">YouTube URL</Label>
              <Input
                id="submission-youtube-url"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                maxLength={500}
              />
            </div>
            {preflight?.duplicate ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                이미 {preflight.duplicate === "catalog" ? "카탈로그에 등록된" : "검토 중인"} 영상입니다.
              </p>
            ) : null}
            <Button
              onClick={() => void verifyVideo()}
              disabled={!youtubeUrl.trim() || preflightMutation.isPending}
            >
              영상 확인 <ChevronRight />
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="submission-title">곡명</Label>
              <div className="flex gap-2">
                <Input
                  id="submission-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={300}
                />
                <Button type="button" variant="outline" onClick={searchSongCandidates}>
                  기존 곡 찾기
                </Button>
              </div>
            </div>
            {preflight?.songCandidates.length ? (
              <div className="space-y-2">
                <Label>기존 곡 후보</Label>
                <div className="grid gap-2">
                  {preflight.songCandidates.map((song) => (
                    <button
                      type="button"
                      key={song.id}
                      onClick={() => setSuggestedSongId(song.id)}
                      className={`rounded-lg border p-3 text-left text-sm ${suggestedSongId === song.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                    >
                      <span className="font-medium">{song.title}</span>
                      {song.originalArtists.length ? (
                        <span className="ml-2 text-muted-foreground">{song.originalArtists.join(", ")}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <ChipInput
              label="원곡 가수"
              values={originalArtists}
              onChange={setOriginalArtists}
              placeholder="이름 입력 후 Enter"
            />
            <div className="space-y-2">
              <Label>OTW 참여 멤버</Label>
              <div className="flex flex-wrap gap-2">
                {(members.data ?? []).map((member) => {
                  const selected = memberUids.includes(member.uid);
                  return (
                    <Button
                      key={member.uid}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() =>
                        setMemberUids(
                          selected
                            ? memberUids.filter((uid) => uid !== member.uid)
                            : [...memberUids, member.uid],
                        )
                      }
                    >
                      {selected ? <Check /> : <Plus />} {member.oshi_mark} {member.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <ChipInput
              label="외부 참여자"
              values={externalParticipants}
              onChange={setExternalParticipants}
              placeholder="이름 입력 후 Enter"
            />
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft /> 이전</Button>
              <Button disabled={!canReview} onClick={() => setStep(2)}>검토하기 <ChevronRight /></Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <dt className="text-muted-foreground">영상</dt><dd className="break-all">{preflight?.canonicalUrl}</dd>
                <dt className="text-muted-foreground">곡</dt><dd>{title}</dd>
                <dt className="text-muted-foreground">원곡 가수</dt><dd>{originalArtists.join(", ")}</dd>
                <dt className="text-muted-foreground">참여자</dt><dd>{[
                  ...(members.data ?? []).filter((member) => memberUids.includes(member.uid)).map((member) => member.name),
                  ...externalParticipants,
                ].join(", ")}</dd>
              </dl>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-note">관리자에게 전할 메모 (선택)</Label>
              <Textarea id="submission-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
            </div>
            <p className="text-xs text-muted-foreground">
              관리자에게는 입력한 snapshot이 전달됩니다. 반려 시 회원 화면에는 반려 상태만 표시되고 내부 검수 사유는 공개되지 않습니다.
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft /> 이전</Button>
              <Button
                disabled={submitMutation.isPending}
                onClick={() =>
                  submitMutation.mutate({
                    clientRequestId,
                    youtubeUrl,
                    title,
                    suggestedSongId,
                    originalArtists: originalArtists.map((displayName) => ({ kind: "external", displayName })),
                    participants,
                    note: note || null,
                  })
                }
              >
                최종 제출
              </Button>
            </div>
          </div>
        ) : null}
      </section>
      {message ? <p role="status" className="rounded-lg border bg-background p-3 text-sm">{message}</p> : null}
    </div>
  );
}
