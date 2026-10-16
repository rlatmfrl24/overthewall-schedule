import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const STATIC_ASSET_MANIFEST_PATH = "/profile/__artifact.json";
export function writeStaticAssetManifest(directory) {
  const entries=[];
  for(const folder of ["profile","profile/signatures"]) {
    for(const name of readdirSync(resolve(directory,folder)).sort()) {
      const path=`/${folder}/${name}`;
      if(!/^\/profile\/(?:[a-z0-9_]+\.webp|signatures\/[a-z0-9_]+\.png)$/.test(path)) continue;
      const bytes=readFileSync(resolve(directory,folder,name));
      entries.push({path,hash:createHash("sha256").update(bytes).digest("hex"),size:bytes.length});
    }
  }
  if(!entries.length) throw new Error("Static artifact has no profile/signature files");
  const body=JSON.stringify({version:1,entries});
  writeFileSync(resolve(directory,STATIC_ASSET_MANIFEST_PATH.slice(1)),body);
  return {hash:createHash("sha256").update(body).digest("hex"),entries};
}
