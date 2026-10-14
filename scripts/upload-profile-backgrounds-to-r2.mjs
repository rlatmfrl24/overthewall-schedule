import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parseSiteArgument,getSiteTarget } from "./site-target.mjs";
import { resolveLocalD1Options } from "./d1-local-options.mjs";
import { assertSiteResourceConfig } from "./site-resources.mjs";

export function parseProfileBackgroundName(name) {
  const parts=name.split("--");
  const [code,backgroundId="default"]=parts;
  if(parts.length>2 || !/^[a-z0-9_]+$/.test(code??"") || !/^[a-z0-9][a-z0-9_-]*$/.test(backgroundId)) throw new Error(`Invalid profile background filename: ${name}`);
  return {code,backgroundId};
}
const option=(args,name)=>{
  const values=args.filter(arg=>arg===`--${name}` || arg.startsWith(`--${name}=`));
  if(values.length>1 || values.some(arg=>!arg.includes("=") || !arg.split("=").slice(1).join("="))) throw new Error(`Expected one --${name}=value`);
  return values[0]?.slice(name.length+3);
};

/** Validation completes before the runner is spawned. Imports have no IO effects. */
export function createProfileUploadPlan(args,environment=process.env) {
  const siteId=parseSiteArgument(args);
  const selected=getSiteTarget(siteId);
  for(const arg of args) if(!/^--(?:site|config|bucket|persist-to|source-dir|operation-id|confirm-target|account-id)=.+$/.test(arg) && arg!=="--local" && arg!=="--remote") throw new Error(`Unknown upload argument: ${arg}`);
  const configPath=option(args,"config")??selected.configPath;
  if(resolve(configPath)!==resolve(selected.configPath)) throw new Error("Upload config does not match selected site");
  const scope=args.filter(arg=>arg==="--local" || arg==="--remote");
  if(scope.length!==1) throw new Error("Exactly one explicit --local or --remote scope is required");
  const parsed=ts.parseConfigFileTextToJson(configPath,readFileSync(configPath,"utf8"));
  if(parsed.error) throw new Error("Invalid selected resource config");
  const config=parsed.config;
  assertSiteResourceConfig(config,siteId);
  const bucket=config.vars.SITE_ASSET_BUCKET_NAME,database=config.vars.SITE_D1_DATABASE_NAME;
  if(option(args,"bucket")!==undefined && option(args,"bucket")!==bucket) throw new Error("Upload bucket does not match selected binding");
  const operationId=option(args,"operation-id");
  if(!operationId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(operationId)) throw new Error("A stable --operation-id is required for recovery/retry");
  let persistTo;
  if(scope[0]==="--local") persistTo=resolveLocalD1Options(args,environment).persistTo;
  else {
    if(option(args,"persist-to")) throw new Error("Remote upload cannot use local persistence");
    const accountId=option(args,"account-id");
    if(!accountId || !/^[a-f0-9]{32}$/.test(accountId) || accountId!==(config.account_id??environment.CLOUDFLARE_ACCOUNT_ID) || option(args,"confirm-target")!==`${siteId}/${database}/${bucket}/${accountId}`) throw new Error("Remote upload requires explicit matching account and target confirmation");
    if(config.d1_databases.find(binding=>binding.binding==="otw_db")?.remote!==true || config.r2_buckets.find(binding=>binding.binding==="ASSET_BUCKET")?.remote!==true) throw new Error("Selected remote bindings are not explicit");
  }
  const sourceDir=resolve(option(args,"source-dir")??environment.PROFILE_BACKGROUND_SOURCE_DIR??"r2/profile-background");
  const originals=readdirSync(sourceDir).filter(name=>name.endsWith(".webp")).sort();
  const optimized=readdirSync(resolve(sourceDir,"optimized")).filter(name=>name.endsWith(".webp")).sort();
  if(!originals.length || !optimized.length) throw new Error("Profile background source files are missing");
  const uploads=[];
  for(const file of originals) {
    const {code,backgroundId}=parseProfileBackgroundName(basename(file,".webp"));
    uploads.push({file:resolve(sourceDir,file),key:`members/${code}/backgrounds/${backgroundId}/original.webp`});
  }
  for(const file of optimized) {
    const match=file.match(/^(.+)-(960|1280|1672)\.webp$/);
    if(!match) throw new Error(`Invalid optimized profile background filename: ${file}`);
    const {code,backgroundId}=parseProfileBackgroundName(match[1]);
    uploads.push({file:resolve(sourceDir,"optimized",file),key:`members/${code}/backgrounds/${backgroundId}/w${match[2]}.webp`});
  }
  const validatedUploads=uploads.map(upload=>{
    if(statSync(upload.file).size<=0) throw new Error(`Empty profile background: ${upload.file}`);
    return {...upload,operationId:`${operationId}-${createHash("sha256").update(upload.key).digest("hex").slice(0,32)}`};
  });
  return {siteId,configPath,scope:scope[0].slice(2),persistTo,bucket,database,uploads:validatedUploads};
}

/** @param {string[]} args
 * @param {{spawn?: (command:string,args:string[],options:import("node:child_process").SpawnSyncOptions)=>{status:number|null,error?:Error},environment?:NodeJS.ProcessEnv}} options */
export function runProfileBackgroundUpload(args=process.argv.slice(2),{spawn=spawnSync,environment=process.env}={}) {
  createProfileUploadPlan(args,environment);
  const result=spawn(process.execPath,[resolve("node_modules/tsx/dist/cli.mjs"),"--tsconfig",resolve("tsconfig.worker.json"),resolve("scripts/profile-background-upload-runner.ts"),...args],{cwd:process.cwd(),stdio:"inherit",env:environment});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`Recoverable profile upload failed (${result.status??"unknown"}); retry the same operation ID`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) runProfileBackgroundUpload();
