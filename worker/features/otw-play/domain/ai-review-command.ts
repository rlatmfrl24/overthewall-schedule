import type { AiReviewUnknownEvidence } from '@contracts/otw-play-ai-review';

/** Only the inspected legacy running-attempt adoption. New/known-unissued
 * requests must use their original execution path, never this disposition. */
export interface UnknownAiReviewCommand extends Omit<AiReviewUnknownEvidence, 'operationId'> {
  action: 'adopt_unknown';
  reviewId: string;
  candidateId: string;
  expectedVersion: number;
  videoId: string;
  now: number;
}
export function parseUnknownAiReviewCommand(raw: unknown): UnknownAiReviewCommand | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'action,attemptId,candidateId,evidenceHash,expectedVersion,issuance,now,requestHash,reviewId,videoId' ||
    r.action !== 'adopt_unknown' || !['issued', 'issuance_unknown'].includes(String(r.issuance)) ||
    !['reviewId', 'attemptId'].every(k => typeof r[k] === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(r[k] as string)) ||
    typeof r.candidateId !== 'string' || !r.candidateId || r.candidateId.length > 200 ||
    !['requestHash', 'evidenceHash'].every(k => typeof r[k] === 'string' && /^[a-f0-9]{64}$/.test(r[k] as string)) ||
    !['now', 'expectedVersion'].every(k => Number.isSafeInteger(r[k]) && Number(r[k]) >= 0) ||
    typeof r.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(r.videoId)) return null;
  return r as unknown as UnknownAiReviewCommand;
}

/** The next POST is known not to have started. This identity cannot authorize
 * uncertainty closure; a current target administrator must confirm resumption. */
export interface ResumeAiReviewCommand extends Omit<UnknownAiReviewCommand,'action'|'issuance'> {
  action:'adopt_unissued';
  issuance:'unissued';
}
export function parseResumeAiReviewCommand(raw:unknown):ResumeAiReviewCommand|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;
  if(r.action!=='adopt_unissued'||r.issuance!=='unissued'||!parseUnknownAiReviewCommand({...r,action:'adopt_unknown',issuance:'issuance_unknown'}))return null;
  return r as unknown as ResumeAiReviewCommand;
}
