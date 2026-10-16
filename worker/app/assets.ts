import { parseSiteStorageResources,getSiteDefinition } from "@contracts/site-definition";
import { createHandleR2Asset,createHandleProtectedAssetReference,D1ProtectedAssetReferenceResolver, D1AssetAccessReader, R2AssetReader, D1R2FileStore } from "../features/assets";
import type { Env } from "../platform/types";
import {getWorkerSiteDefinition} from "../platform/site";
import {D1NoticeGateway} from "../features/notices";
import {getDb} from "../platform/db";

export const buildAssetFileStore = (env:Env) => {
  const {site,bucket}=parseSiteStorageResources(env);
  if(!env.ASSET_BUCKET) throw new Error("R2 binding required");
  return new D1R2FileStore(env.otw_db,env.ASSET_BUCKET,site,bucket);
};

export const handleAsset = createHandleR2Asset(
  env => env.ASSET_BUCKET ? new R2AssetReader(env.ASSET_BUCKET,env.otw_db) : null,
  env => new D1AssetAccessReader(env.otw_db,getWorkerSiteDefinition(env).publicOrigin,getWorkerSiteDefinition(env).id),
);
export const handleProtectedAssetReference=createHandleProtectedAssetReference(env=>{
  const {site,bucket}=parseSiteStorageResources(env);
  const origins=[getSiteDefinition(site).publicOrigin,getWorkerSiteDefinition(env).publicOrigin].filter((origin):origin is string=>!!origin);
  return new D1ProtectedAssetReferenceResolver(env.otw_db,site,bucket,origins,new D1NoticeGateway(getDb(env)));
});
