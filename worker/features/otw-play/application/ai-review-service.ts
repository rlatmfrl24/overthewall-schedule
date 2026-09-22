import {
  isAiReviewPending,
  type AiReviewDto,
  type AiReviewRequest,
} from "@contracts/otw-play-ai-review";
import {
  AiReviewError,
  type AiReviewRepository,
  type AiReviewAnalyzer,
  type AiReviewContext,
  type AiReviewQueue,
  type AiReviewRecord,
  type AiReviewBroadcastReader,
} from "./ports/ai-review";
import type { OtwPlayYouTubeMetadataReader } from "./ports/youtube-metadata";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";
import { resolveAiReviewCatalog } from "../domain/ai-review-result";
import { AI_REVIEW_PROMPT_VERSION, isAiReviewPromptSupported } from "../domain/ai-review-policy";
import { buildAiReviewData } from "./ai-review-input";

export class AiReviewService {
  private readonly repository: AiReviewRepository;
  private readonly metadata: OtwPlayYouTubeMetadataReader;
  private readonly analyzer: AiReviewAnalyzer;
  private readonly context: AiReviewContext;
  private readonly queue: AiReviewQueue;
  private readonly config: {
    enabled: boolean;
    model: string;
    dailyLimit: number;
  };
  private readonly hash: (s: string) => Promise<string>;
  private readonly id: () => string;
  private readonly clock: () => number;
  private readonly broadcastReader?: AiReviewBroadcastReader;
  constructor(
    repository: AiReviewRepository,
    metadata: OtwPlayYouTubeMetadataReader,
    analyzer: AiReviewAnalyzer,
    context: AiReviewContext,
    queue: AiReviewQueue,
    config: { enabled: boolean; model: string; dailyLimit: number },
    hash: (s: string) => Promise<string>,
    id: () => string,
    clock: () => number,
    broadcastReader?: AiReviewBroadcastReader,
  ) {
    this.repository = repository;
    this.metadata = metadata;
    this.analyzer = analyzer;
    this.context = context;
    this.queue = queue;
    this.config = config;
    this.hash = hash;
    this.id = id;
    this.clock = clock;
    this.broadcastReader = broadcastReader;
  }
  private enabled() {
    if (!this.config.enabled)
      throw new AiReviewError(
        "ai_unconfigured",
        "AI 자동 채우기가 설정되지 않았습니다.",
        503,
      );
  }
  private async target(request: Pick<AiReviewRequest, "target" | "range">) {
    const t = request.target;
    const candidate =
      "candidateId" in t ? await this.context.candidate(t.candidateId) : null;
    const videoId =
      candidate?.videoId ??
      ("youtubeUrl" in t ? extractYouTubeVideoId(t.youtubeUrl) : null);
    if (!videoId)
      throw new AiReviewError(
        "invalid_video",
        "올바른 YouTube URL을 입력하세요.",
      );
    const candidateKind =
      candidate?.candidateKind ??
      ("candidateKind" in t ? t.candidateKind : "official_video");
    const candidateId = "candidateId" in t ? t.candidateId : null;
    return {
      videoId,
      candidateKind,
      candidateId,
      candidate,
      targetKey: JSON.stringify([
        candidateId,
        videoId,
        candidateKind,
        request.range,
      ]),
    };
  }
  private async dto(r: AiReviewRecord): Promise<AiReviewDto> {
    const {
      input: _input,
      inputHash: _hash,
      targetKey: _target,
      leaseToken: _lease,
      ...dto
    } = r;
    void _input;
    void _hash;
    void _target;
    void _lease;
    if (!isAiReviewPromptSupported(r.input?.promptVersion))
      return { ...dto, result: null, status: "failed", errorCode: "analysis_outdated", errorMessage: "분석 기준이 개선되었습니다. 재분석을 실행하세요.", retryable: false };
    if (dto.expiresAt <= this.clock())
      return {
        ...dto,
        status: "failed",
        result: null,
        errorCode: "expired",
        errorMessage: "분석 결과가 만료되었습니다.",
        retryable: false,
      };
    if (dto.result)
      dto.result = resolveAiReviewCatalog(
        dto.result,
        await this.context.catalog(),
      );
    return dto;
  }
  async get(id: string) {
    const r = await this.repository.get(id);
    if (!r)
      throw new AiReviewError("not_found", "분석을 찾을 수 없습니다.", 404);
    return this.dto(r);
  }
  async latest(request: Pick<AiReviewRequest, "target" | "range">) {
    this.enabled();
    const t = await this.target(request);
    const r = await this.repository.latest(t.targetKey, this.clock());
    return r ? this.dto(r) : null;
  }
  async start(request: AiReviewRequest, actor: string) {
    this.enabled();
    const t = await this.target(request);
    const now = this.clock();
    if (t.candidate && ["converted", "ignored"].includes(t.candidate.status))
      throw new AiReviewError(
        "completed_candidate",
        "처리 완료된 후보는 분석할 수 없습니다.",
        409,
      );
    const requestHash = await this.hash(
      JSON.stringify([t.targetKey, Boolean(request.force)]),
    );
    const key = `${actor}:${request.idempotencyKey}`;
    const previous = await this.repository.request(key);
    if (previous) {
      if (previous.hash !== requestHash)
        throw new AiReviewError(
          "idempotency_conflict",
          "다른 분석에 사용된 요청 키입니다.",
          409,
        );
      return this.get(previous.id);
    }
    const video = await this.metadata.readVideo(t.videoId);
    if (!video || video.privacyStatus !== "public")
      throw new AiReviewError(
        "video_unavailable",
        "공개 YouTube 영상만 분석할 수 있습니다.",
      );
    if (
      video.durationSeconds === null ||
      video.durationSeconds <= 0 ||
      (request.range &&
        (request.range.endSeconds > video.durationSeconds ||
          request.range.startSeconds >= video.durationSeconds))
    )
      throw new AiReviewError(
        "invalid_range",
        "영상 길이와 분석 구간을 확인하세요.",
      );
    const catalog = await this.context.catalog();
    const input = {
      video,
      range: request.range,
      candidateKind: t.candidateKind,
      members: (catalog.members ?? [])
        .map((member) => ({
          name: member.name,
          aliases: member.aliases,
        })),
      promptVersion: AI_REVIEW_PROMPT_VERSION,
    };
    const inputHash = await this.hash(
      JSON.stringify([t.targetKey, buildAiReviewData(input), this.config.model, AI_REVIEW_PROMPT_VERSION]),
    );
    const r: AiReviewRecord = {
      id: this.id(),
      candidateId: t.candidateId,
      videoId: t.videoId,
      candidateKind: t.candidateKind,
      range: request.range,
      targetKey: t.targetKey,
      inputHash,
      input,
      model: this.config.model,
      status: "queued",
      result: null,
      usage: null,
      attempts: 0,
      leaseToken: null,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 86400000,
    };
    const saved = await this.repository.create(
      r,
      key,
      requestHash,
      Boolean(request.force),
      now,
    );
    if (isAiReviewPending(saved.status)) {
      try {
        await this.queue.send(saved.id);
      } catch {
        /* Durable row is retried by maintenance. */
      }
    }
    return this.dto(saved);
  }
  async process(id: string) {
    if (!this.config.enabled) return;
    const token = this.id();
    const r = await this.repository.claim(
      id,
      token,
      this.clock(),
      this.config.dailyLimit,
    );
    if (!r?.input) return;
    let output: Awaited<ReturnType<AiReviewAnalyzer["analyze"]>>;
    try {
      if (!isAiReviewPromptSupported(r.input.promptVersion))
        throw new AiReviewError("analysis_outdated", "분석 기준이 개선되었습니다. 재분석을 실행하세요.", 409);
      output = await this.analyzer.analyze(r.input, r.model);
      try {
        const catalog = await this.context.catalog();
        output.result = resolveAiReviewCatalog(output.result, catalog);
        await this.verifyBroadcastSources(output.result, catalog);
      }
      catch {
        // Preserve the expensive video result. dto() must successfully recheck
        // the current catalog before any result is exposed to the form.
        for (const song of output.result.songs) {
          if (!song.values.originalUrl) continue;
          delete song.values.originalUrl;
          delete song.evidence.originalUrl;
          song.warnings.push("원본 방송 링크: 출처 확인이 일시적으로 불가능해 제외했습니다. 다른 분석 결과는 유지했습니다.");
        }
      }
    } catch (error) {
      await this.repository.finish(
        id,
        token,
        null,
        null,
        error instanceof AiReviewError
          ? error
          : new AiReviewError(
              "analysis_failed",
              "분석을 완료하지 못했습니다.",
              502,
            ),
        this.clock(),
      );
      return;
    }
    // Persistence errors must leave the lease recoverable, not become model failures.
    await this.repository.finish(
      id,
      token,
      output.result,
      output.usage,
      null,
      this.clock(),
    );
  }
  private async verifyBroadcastSources(
    result: Awaited<ReturnType<AiReviewAnalyzer["analyze"]>>["result"],
    catalog: Awaited<ReturnType<AiReviewContext["catalog"]>>,
  ) {
    if (!result.songs.some((song) => song.values.originalUrl)) return;
    const sources = new Map<string, Awaited<ReturnType<AiReviewBroadcastReader["read"]>>>();
    for (const [index, song] of result.songs.entries()) {
      const url = song.values.originalUrl;
      if (!url) continue;
      // Shared source URLs across a medley cost one metadata read. Bound extra work
      // within the execution lease; an unavailable link must not rerun Gemini.
      if (!sources.has(url) && sources.size < 3) {
        try { sources.set(url, await this.broadcastReader?.read(url) ?? null); }
        catch { sources.set(url, null); }
      }
      const source = sources.get(url);
      const memberIds = result.songs[index].values.participants?.flatMap((person) => {
        if (!["vocal", "featured_vocal", "chorus"].includes(person.role)) return [];
        if (person.subject?.kind === "member") return [person.subject.memberUid];
        if (person.subject?.kind !== "entity") return [];
        const entityId = person.subject.entityId;
        return catalog.entities.find((entity) => entity.id === entityId)?.memberUid ?? [];
      }) ?? [];
      const owner = catalog.members?.find((member) => memberIds.includes(member.uid) && source &&
        (source.platform === "youtube" ? member.youtubeChannelIds.includes(source.channelId) : member.chzzkChannelId === source.channelId));
      if (!source || !owner || !(source.isBroadcast || (source.platform === "youtube" && owner.youtubeVodChannelIds.includes(source.channelId)))) {
        delete song.values.originalUrl;
        delete song.evidence.originalUrl;
        song.warnings.push("원본 방송 링크: 가창 멤버의 다시보기인지 확인할 수 없어 제외했습니다. 원곡 링크 대신 실제 방송 출처를 확인해 주세요.");
      }
    }
  }
  async recover() {
    if (!this.config.enabled) return { queued: 0, failed: 0 };
    const ids = await this.repository.recover(this.clock());
    let queued = 0,
      failed = 0;
    for (const id of ids) {
      try {
        await this.queue.send(id);
        queued++;
      } catch {
        failed++;
      }
    }
    return { queued, failed };
  }
  clearExpired() {
    return this.repository.clearExpired(this.clock());
  }
  markDead(id: string) {
    return this.repository.markDead(id, this.clock());
  }
}
