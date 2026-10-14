import { parseSiteStorageResources,getSiteDefinition } from "@contracts/site-definition";
import { createHandleR2Asset,createHandleProtectedAssetReference,D1ProtectedAssetReferenceResolver, D1AssetAccessReader, R2AssetReader, D1R2FileStore, D1TransitionFileWriter, D1FileAvailability } from "../features/assets";
import type { Env } from "../platform/types";
import { D1TransitionRepository } from "../features/content-transition";
import {getWorkerSiteDefinition} from "../platform/site";

export const buildAssetFileStore = (env:Env) => {
  const {site,database,bucket}=parseSiteStorageResources(env);
  if(!env.ASSET_BUCKET) throw new Error("R2 binding required");
  return new D1R2FileStore(env.otw_db,env.ASSET_BUCKET,site,bucket,new D1TransitionFileWriter(new D1TransitionRepository(env.otw_db,site,database,bucket),site,bucket));
};

export const buildFileAvailability = (env:Env) => {
  const {site,bucket}=parseSiteStorageResources(env);
  if(!env.ASSET_BUCKET || !env.ASSETS) throw new Error("Selected R2 and ASSETS bindings required");
  return new D1FileAvailability(env.otw_db,env.ASSET_BUCKET,env.ASSETS,site,bucket);
};
export const buildFileTransitionRepository = (env:Env) => {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1TransitionRepository(env.otw_db,site,database,bucket,buildFileAvailability(env));
};

export const handleAsset = createHandleR2Asset(
  env => env.ASSET_BUCKET ? new R2AssetReader(env.ASSET_BUCKET,env.otw_db) : null,
  env => new D1AssetAccessReader(env.otw_db,getWorkerSiteDefinition(env).publicOrigin),
);
export const handleProtectedAssetReference=createHandleProtectedAssetReference(env=>{
  const {site,bucket}=parseSiteStorageResources(env);
  const origins=[getSiteDefinition(site).publicOrigin,getWorkerSiteDefinition(env).publicOrigin].filter((origin):origin is string=>!!origin);
  return new D1ProtectedAssetReferenceResolver(env.otw_db,site,bucket,origins);
});
