import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createProfileUploadPlan} from "./upload-profile-backgrounds-to-r2.mjs";
import {buildAssetFileStore} from "../worker/app/assets";
import type {Env} from "../worker/platform/types";

export async function executeProfileBackgroundUpload(args:string[]) {
  // Both executable boundaries validate before loading the storage runtime.
  const plan=createProfileUploadPlan(args);
  const {getPlatformProxy}=await import("wrangler");
  // getPlatformProxy accepts the storage-version directory; Wrangler --persist-to
  // accepts its parent and appends v3. Keep both normal entries on the same DB/R2.
  const proxy=await getPlatformProxy<Env>({configPath:plan.configPath,envFiles:[],remoteBindings:plan.scope==="remote",persist:plan.scope==="local"?{path:resolve(plan.persistTo!,"v3")}:false});
  console.log(JSON.stringify({site:plan.siteId,config:plan.configPath,database:plan.database,bucket:plan.bucket,scope:plan.scope,remoteBindings:plan.scope==="remote",persistTo:plan.persistTo}));
  try {
  const store=buildAssetFileStore(proxy.env);
  for(const upload of plan.uploads) {
    const bytes=new Uint8Array(readFileSync(upload.file));
    const receipt=await store.put({operationId:upload.operationId,logicalKey:upload.key,contentType:"image/webp",bytes});
    console.log(JSON.stringify({site:plan.siteId,bucket:plan.bucket,logicalKey:receipt.logicalKey,versionKey:receipt.versionKey,hash:receipt.hash,size:receipt.size,operationId:receipt.operationId,acknowledged:true}));
  }
  console.log(`Uploaded and acknowledged ${plan.uploads.length} immutable profile versions to ${plan.siteId}/${plan.bucket} (${plan.scope}).`);
  } finally {await proxy.dispose();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await executeProfileBackgroundUpload(process.argv.slice(2));
