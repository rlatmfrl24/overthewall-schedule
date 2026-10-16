import type {
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayBroadcastMetadata,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
} from "./otw-play";

export type AiReviewKind = "official_video" | "singing_clip";
export type AiReviewRange = { startSeconds: number; endSeconds: number } | null;
export type AiReviewTarget =
  | { candidateId: string }
  | { youtubeUrl: string; candidateKind: AiReviewKind };
export interface AiReviewRequest {
  target: AiReviewTarget;
  range: AiReviewRange;
  idempotencyKey: string;
  force?: boolean;
}
export interface AiReviewPerson {
  name: string;
  sourceNames?: string[];
  entityKind: "person" | "group";
  subject: OtwPlayAdminCatalogSubjectInput | null;
}
export interface AiReviewFields {
  song: {
    title: string;
    alternateTitles?: string[];
    originalArtists: AiReviewPerson[];
    tags: string[];
    existingSongId: string | null;
    candidates: { id: string; title: string }[];
  };
  participants: (AiReviewPerson & { role: OtwPlayParticipantRole })[];
  classification: {
    relationType: "original" | "cover" | "singing_clip";
    releaseType: "official_mv" | "official_video" | "broadcast";
  };
  participationType: OtwPlayParticipationType;
  performanceTags: string[];
  segment: { startSeconds: number; endSeconds: number };
  broadcastDate: Pick<OtwPlayBroadcastMetadata, "performedOn" | "dateEvidence">;
  originalUrl: string;
  extent: "full" | "partial";
}
export type AiReviewField = keyof AiReviewFields;
export const AI_REVIEW_FIELDS: AiReviewField[] = [
  "song",
  "participants",
  "classification",
  "participationType",
  "performanceTags",
  "segment",
  "broadcastDate",
  "originalUrl",
  "extent",
];
export interface AiReviewEvidence {
  source: "title" | "description" | "metadata" | "video";
  text: string;
  seconds: number | null;
}
export interface AiReviewSuggestion {
  values: Partial<AiReviewFields>;
  evidence: Partial<Record<AiReviewField, AiReviewEvidence[]>>;
  warnings: string[];
}
export interface AiReviewResult {
  videoAnalyzed: boolean;
  warnings: string[];
  songs: AiReviewSuggestion[];
}
export type AiReviewStatus =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "partial"
  | "failed";
/** Recovery responsibility is distinct from the original model outcome. Account
 * identities and provider credentials remain private to the deciding site. */
export interface AiReviewUnknownEvidence {
  operationId: string;
  attemptId: string;
  requestHash: string;
  evidenceHash: string;
  issuance: "issued" | "issuance_unknown";
}
export type AiReviewRecovery = AiReviewUnknownEvidence & (
  | { state: "outcome_unknown" }
  | { state: "closed_by_admin"; decisionId: string; decidedAt: number }
);
export interface AiReviewCloseUnknownRequest extends AiReviewUnknownEvidence {
  decision: "close_unknown";
  idempotencyKey: string;
}
export interface AiReviewResumeEvidence {
  operationId:string;
  attemptId:string;
  requestHash:string;
  evidenceHash:string;
  issuance:'unissued';
}
export interface AiReviewResumeRequest extends AiReviewResumeEvidence {
  decision:'resume_unissued';
  idempotencyKey:string;
}
export type AiReviewContinuation = AiReviewResumeEvidence & (
  | {state:'confirmation_required'}
  | {state:'confirmed';executionId:string;confirmedAt:number}
);
export interface AiReviewDto {
  id: string;
  candidateId: string | null;
  videoId: string;
  candidateKind: AiReviewKind;
  range: AiReviewRange;
  status: AiReviewStatus;
  result: AiReviewResult | null;
  model: string;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  nextRetryAt: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  recovery?: AiReviewRecovery;
  continuation?:AiReviewContinuation;
}
export const isAiReviewPending = (status: AiReviewStatus) =>
  ["queued", "running", "retry_wait"].includes(status);
export const isAiReviewExecuting = (review: Pick<AiReviewDto, "status" | "recovery"|'continuation'>) =>
  !review.recovery && review.continuation?.state!=='confirmation_required' && isAiReviewPending(review.status);
