export type FxRssEntry = { id: string; handle: string; createdAtHint: number };
export type FxRssPage = { entries: FxRssEntry[]; rawCount: number };

export class FxCandidateExcludedError extends Error {
  readonly code = "fx_candidate_excluded";
  constructor() { super("fx_candidate_excluded"); }
}
