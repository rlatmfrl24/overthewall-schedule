import type { TransitionPlan } from "@contracts/content-transition";
import {getAssetContentType,isStaticProfileAsset} from "./asset-key-policy";

/** SQL form of the owning path allowlist for the final atomic manifest gate. */
export function ownedFilePathSql(value:string):string {
  const part=(i:number)=>`json_extract(s,'$[${i}]')`;
  const code=(v:string)=>`length(${v})>0 AND ${v} NOT GLOB '*[^a-z0-9_]*'`;
  const profile=(offset:number)=>`(${part(1+offset)}='profile' AND (json_array_length(s)=${3+offset} AND ${part(2+offset)} GLOB '*.webp' AND ${code(`substr(${part(2+offset)},1,length(${part(2+offset)})-5)`)} OR json_array_length(s)=${4+offset} AND ${part(2+offset)}='signatures' AND ${part(3+offset)} GLOB '*.png' AND ${code(`substr(${part(3+offset)},1,length(${part(3+offset)})-4)`)}))`;
  const notice=part(4),member=part(3),background=part(5);
  return `(WITH p AS (SELECT ${value} path),parts AS (SELECT path,'['||replace(json_quote(lower(path)),'/','","')||']' s FROM p) SELECT
    ${profile(0)} OR substr(path,1,11)='/r2-assets/' AND (
      path=lower(path) AND ${profile(1)} OR
      json_array_length(s)=5 AND ${part(2)}='notices' AND ${part(3)}='thumbnails' AND ${notice} GLOB '[a-z0-9]*' AND ${notice} NOT GLOB '*[^a-z0-9._-]*' AND (${notice} GLOB '*.webp' OR ${notice} GLOB '*.png' OR ${notice} GLOB '*.jpg' OR ${notice} GLOB '*.jpeg') OR
      json_array_length(s)=7 AND ${part(2)}='members' AND (${code(member)}) AND ${part(4)}='backgrounds' AND ${background} GLOB '[a-z0-9]*' AND ${background} NOT GLOB '*[^a-z0-9_-]*' AND ${part(6)} IN ('original.webp','w960.webp','w1280.webp','w1672.webp')) FROM parts)`;
}

export function validateFileOrigins(plan:TransitionPlan) {
  const seen=new Set<string>();
  for(const entry of plan.fileOrigins??[]) {
    const url=new URL(entry.origin);
    if(!["https:","http:"].includes(url.protocol) || url.origin!==entry.origin || url.username || url.password || seen.has(entry.origin)) throw new Error("File origin classification conflict");
    seen.add(entry.origin);
    if(entry.kind==="external") {
      if(Object.keys(entry).sort().join(",")!=="kind,origin,reason" || !entry.reason.trim()) throw new Error("Invalid external file classification");
    } else {
      if(![plan.sourceSite,plan.targetSite].includes(entry.site)) throw new Error("File origin site conflict");
      if(entry.kind==="r2") {
        if(Object.keys(entry).sort().join(",")!=="kind,origin,resource,site" || entry.resource!==plan.assetBuckets?.[entry.site===plan.sourceSite?"source":"target"]) throw new Error("File origin resource conflict");
      } else if(entry.kind!=="site" || Object.keys(entry).sort().join(",")!=="kind,origin,site") throw new Error("Invalid file origin classification");
    }
  }
}
export function classifyFileReference(raw:string,plan:TransitionPlan):{kind:"owned";path:string;site:typeof plan.sourceSite;resource:string}|{kind:"external";url:string} {
  const value=raw.trim();
  const relative=value.startsWith("/")&&!value.startsWith("//");
  const url=new URL(value,"https://selected-assets.invalid");
  if(relative && url.origin!=="https://selected-assets.invalid") throw new Error("Ambiguous file path authority");
  const entry=relative?null:plan.fileOrigins?.find(entry=>entry.origin===url.origin);
  if(!relative && (!entry || !value.startsWith(`${url.origin}/`) || url.username || url.password)) throw new Error("Missing canonical file origin classification");
  if(entry?.kind==="external") return {kind:"external",url:raw};
  const path=normalizeOwnedFilePath(url.pathname,entry?.kind==="r2");
  const site=entry?.site??plan.sourceSite;
  const resource=isStaticProfileAsset(path)?`${site}:ASSETS`:plan.assetBuckets?.[site===plan.sourceSite?"source":"target"];
  if(!resource) throw new Error("Unresolved owned file reference");
  return {kind:"owned",path,site,resource};
}
export function normalizeOwnedFilePath(pathname:string,bucketOrigin=false):string {
  const decoded=decodeURIComponent(pathname).replaceAll("\\","/");
  if(decoded.startsWith("//")) throw new Error("Ambiguous file path authority");
  let path=new URL(decoded,"https://selected-assets.invalid").pathname;
  if(bucketOrigin) path=`/r2-assets${path}`;
  if(!isStaticProfileAsset(path) && (!path.startsWith("/r2-assets/") || !getAssetContentType(path.slice("/r2-assets/".length)))) throw new Error("Unresolved owned file reference");
  return path;
}
