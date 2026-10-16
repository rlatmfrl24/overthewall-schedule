import { getAssetContentType, getAssetMemberCode } from "./asset-key-policy";

export interface FileReplacement {
  logicalKey: string;
  versionKey: string;
  previousVersion: string | null;
  hash: string;
  size: number;
  contentType: string;
  memberUid:number|null;
  memberCode:string|null;
}
/** The same positive allowlist owns ordinary upload and transferred commands. */
export function parseFileReplacement(raw: unknown): FileReplacement | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as FileReplacement;
  if (typeof value.logicalKey !== "string" || getAssetContentType(value.logicalKey) !== value.contentType ||
      !/^_versions\/(?:otw|luvdia)\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.(?:webp|png|jpe?g)$/.test(value.versionKey) ||
      !(value.previousVersion === null || typeof value.previousVersion === "string" && value.previousVersion.length > 0) ||
      !/^[a-f0-9]{64}$/.test(value.hash) || !Number.isSafeInteger(value.size) || value.size <= 0) return null;
  const code=getAssetMemberCode(value.logicalKey);
  if(code!==value.memberCode || (code!==null? !Number.isSafeInteger(value.memberUid) || Number(value.memberUid)<=0:value.memberUid!==null)) return null;
  if(code!==null && !value.logicalKey.startsWith(`members/${code}/backgrounds/`) && value.logicalKey!==`profile/${code}.webp` && value.logicalKey!==`profile/signatures/${code}.png`) return null;
  return { logicalKey:value.logicalKey, versionKey:value.versionKey, previousVersion:value.previousVersion, hash:value.hash, size:value.size, contentType:value.contentType,memberUid:value.memberUid,memberCode:value.memberCode };
}
