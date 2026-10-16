import {catalogImportProjection} from "../features/otw-play";
import { parseSiteStorageResources } from "@contracts/site-definition";
import { D1TransitionRepository } from "../features/content-transition";
import { buildXPostsApplication, D1RedactionWriter } from "../features/x-posts";
import type { Env } from "../platform/types";

export const buildOwnedXPostsApplication=(env:Env)=> {
  const {site,database}=parseSiteStorageResources(env);
  const writer=new D1RedactionWriter(env.otw_db,new D1TransitionRepository(env.otw_db,site,database, null, null, catalogImportProjection),site);
  return buildXPostsApplication(env,(id,actor)=>writer.redact(id,actor));
};
