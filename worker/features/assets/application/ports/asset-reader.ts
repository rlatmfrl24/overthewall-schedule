import type {ProtectedAssetReferenceContext} from "@contracts/assets";

export interface AssetObject {
  body: ReadableStream<Uint8Array> | null;
  etag: string;
  httpMetadata: Record<string, string>;
}

export interface AssetReader {
  read(key: string): Promise<AssetObject | null>;
}

export interface AssetAccessReader {
  readAccess(path: string): Promise<{ restricted: boolean; revision: number }>;
}
export interface ProtectedAssetReferenceResolver {
  resolve(raw:string,context?:ProtectedAssetReferenceContext):Promise<string|null>;
}
export interface NoticeImageMemberValidator {
  areRelatedMembersValid(memberUids:number[]):Promise<boolean>;
}
