export type ProtectedAssetReferenceContext =
  | {kind:"notice";id:number}
  | {kind:"notice-draft";id?:number;relatedMemberUids:number[]};
/** A verified admin may resolve an absolute image to a same-site path.
 * null means external display allowed by the actual normal notice/draft context
 * or its approved transition classification; it carries no bearer URL. */
export interface ProtectedAssetReferenceResponse {path:string|null}
