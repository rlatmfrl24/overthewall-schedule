import type {
  AiReviewDto,
  AiReviewKind,
  AiReviewRange,
  AiReviewResult,
} from "@contracts/otw-play-ai-review";
import type { OtwPlayAdminCatalogDto } from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoMetadata } from "./youtube-metadata";
import type { AiReviewMember } from "../../domain/ai-review-policy";

export class AiReviewError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  constructor(code: string, message: string, status = 400, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.name = "AiReviewError";
  }
}
export interface AiReviewInput {
  video: OtwPlayYouTubeVideoMetadata;
  range: AiReviewRange;
  candidateKind: AiReviewKind;
  members: { name: string; aliases: string[] }[];
  promptVersion?: string;
}
export interface AiReviewRecord extends AiReviewDto {
  input: AiReviewInput | null;
  inputHash: string;
  targetKey: string;
  leaseToken: string | null;
}
export interface AiReviewRepository {
  get(id: string): Promise<AiReviewRecord | null>;
  latest(targetKey: string, now: number): Promise<AiReviewRecord | null>;
  request(key: string): Promise<{ hash: string; id: string } | null>;
  create(
    record: AiReviewRecord,
    requestKey: string,
    requestHash: string,
    force: boolean,
    now: number,
  ): Promise<AiReviewRecord>;
  claim(
    id: string,
    token: string,
    now: number,
    dailyLimit: number,
  ): Promise<AiReviewRecord | null>;
  finish(
    id: string,
    token: string,
    result: AiReviewResult | null,
    usage: AiReviewDto["usage"],
    error: AiReviewError | null,
    now: number,
  ): Promise<void>;
  recover(now: number): Promise<string[]>;
  clearExpired(now: number): Promise<number>;
  markDead(id: string, now: number): Promise<void>;
}
export interface AiReviewContext {
  candidate(
    id: string,
  ): Promise<{ videoId: string; candidateKind: AiReviewKind; status: string }>;
  catalog(): Promise<
    OtwPlayAdminCatalogDto & { entityAliases?: Record<string, string[]>; members?: AiReviewMember[] }
  >;
}
export interface AiReviewAnalyzer {
  analyze(
    input: AiReviewInput,
    model?: string,
  ): Promise<{ result: AiReviewResult; usage: AiReviewDto["usage"] }>;
}
export interface AiReviewQueue {
  send(id: string): Promise<void>;
}
export interface AiReviewBroadcastReader {
  read(url: string): Promise<{
    platform: "youtube" | "chzzk";
    channelId: string;
    isBroadcast: boolean;
  } | null>;
}
