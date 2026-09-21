import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayMemberSubmissionPageDto,
  OtwPlaySubmissionPreflightRequest,
  OtwPlayUpdateSubmissionRequest,
  OtwPlayWithdrawSubmissionRequest,
} from "@contracts/otw-play";
import {
  decodeMemberSubmissionCursor,
  encodeMemberSubmissionCursor,
} from "../domain/member-submission-cursor";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";
import { normalizeOtwPlaySearchText } from "../domain/search-normalization";
import type { OtwPlayYouTubeMetadataReader } from "./ports/youtube-metadata";
import type { MemberSubmissionRepository } from "./ports/member-submission-repository";

export class MemberSubmissionServiceError extends Error {
  readonly code: "invalid_request" | "not_found" | "unavailable";

  constructor(
    code: "invalid_request" | "not_found" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "MemberSubmissionServiceError";
    this.code = code;
  }
}

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getKstDayBounds = (now: number) => {
  const dayStart =
    Math.floor((now + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return { dayStart, dayEnd: dayStart + DAY_MS };
};

const canonicalYouTubeUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

export class MemberSubmissionService {
  private readonly repository: MemberSubmissionRepository;
  private readonly createId: () => string;
  private readonly clock: () => number;
  private readonly youtube?: OtwPlayYouTubeMetadataReader;

  constructor(
    repository: MemberSubmissionRepository,
    createId: () => string,
    clock: () => number = Date.now,
    youtube?: OtwPlayYouTubeMetadataReader,
  ) {
    this.repository = repository;
    this.createId = createId;
    this.clock = clock;
    this.youtube = youtube;
  }

  searchArtists(query: string) {
    if (!normalizeOtwPlaySearchText(query)) {
      throw new MemberSubmissionServiceError("invalid_request", "가수 이름을 입력해 주세요.");
    }
    return this.repository.searchArtists(query);
  }

  async preflight(userId: string, input: OtwPlaySubmissionPreflightRequest) {
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new MemberSubmissionServiceError(
        "invalid_request",
        "A valid YouTube URL is required",
      );
    }
    const result = await this.repository.preflight(
      userId,
      videoId,
      input.title?.trim() || null,
    );
    const video = input.title ? null : await this.youtube?.readVideo(videoId).catch(() => {
      throw new MemberSubmissionServiceError("unavailable", "영상 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
    });
    if (!input.title && (!video || video.availabilityStatus !== "playable")) {
      throw new MemberSubmissionServiceError("invalid_request", "공개되어 재생할 수 있는 YouTube 영상인지 확인해 주세요.");
    }
    return {
      ...(video ? { video: { title: video.title, channelName: video.channelTitle, durationSeconds: video.durationSeconds } } : {}),
      videoId,
      canonicalUrl: canonicalYouTubeUrl(videoId),
      thumbnailUrl: video?.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      ...result,
    };
  }

  create(userId: string, input: OtwPlayCreateSubmissionRequest) {
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new MemberSubmissionServiceError(
        "invalid_request",
        "A valid YouTube URL is required",
      );
    }
    const now = this.clock();
    return this.repository.create({
      userId,
      proposalId: this.createId(),
      input,
      videoId,
      canonicalUrl: canonicalYouTubeUrl(videoId),
      now,
      ...getKstDayBounds(now),
    });
  }

  findReplay(userId: string, input: OtwPlayCreateSubmissionRequest) {
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new MemberSubmissionServiceError(
        "invalid_request",
        "A valid YouTube URL is required",
      );
    }
    return this.repository.findReplay(
      userId,
      input,
      canonicalYouTubeUrl(videoId),
    );
  }

  async listMine(
    userId: string,
    limit: number,
    cursorValue: string | null,
  ): Promise<OtwPlayMemberSubmissionPageDto> {
    const cursor = cursorValue
      ? decodeMemberSubmissionCursor(cursorValue)
      : null;
    const result = await this.repository.listMine(userId, limit, cursor);
    const last = result.items.at(-1);
    return {
      items: result.items,
      nextCursor:
        result.hasMore && last
          ? encodeMemberSubmissionCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }

  readMine(userId: string, proposalId: string) {
    return this.repository.readMine(userId, proposalId);
  }

  update(
    userId: string,
    proposalId: string,
    input: OtwPlayUpdateSubmissionRequest,
  ) {
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new MemberSubmissionServiceError(
        "invalid_request",
        "A valid YouTube URL is required",
      );
    }
    return this.repository.update({
      userId,
      proposalId,
      eventId: this.createId(),
      input,
      videoId,
      canonicalUrl: canonicalYouTubeUrl(videoId),
      now: this.clock(),
    });
  }

  withdraw(
    userId: string,
    proposalId: string,
    input: OtwPlayWithdrawSubmissionRequest,
  ) {
    return this.repository.withdraw({
      userId,
      proposalId,
      eventId: this.createId(),
      expectedVersion: input.expectedVersion,
      now: this.clock(),
    });
  }
}
