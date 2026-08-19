import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayMemberSubmissionPageDto,
  OtwPlaySubmissionPreflightRequest,
} from "@contracts/otw-play";
import {
  decodeMemberSubmissionCursor,
  encodeMemberSubmissionCursor,
} from "../domain/member-submission-cursor";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";
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

  constructor(
    repository: MemberSubmissionRepository,
    createId: () => string,
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.createId = createId;
    this.clock = clock;
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
    return {
      videoId,
      canonicalUrl: canonicalYouTubeUrl(videoId),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
}
