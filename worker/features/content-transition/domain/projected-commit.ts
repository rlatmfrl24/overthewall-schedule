import type { TransitionIdentity } from "../../../../contracts/content-transition";
import { projectCapturedRecord, type ProjectionContext, type ProjectedRecord } from "./projected-content";
import { contentDispositionRegistry } from "./disposition-registry";

export interface ProjectedCommit {
  readonly identity: TransitionIdentity;
  readonly sequence: number;
  readonly previous: number;
  readonly digest: string;
  readonly changes: readonly { readonly before: ProjectedRecord|null; readonly after: ProjectedRecord|null }[];
}
const parsed=new WeakSet<object>();
export function assertProjectedCommit(commit: ProjectedCommit) {
  if(!parsed.has(commit)) throw new Error("A parsed commit projection is required");
}
/** The same parser is the baseline, replay and authenticated transport decoder. */
export async function projectCommit(identity: TransitionIdentity, sequence:number, previous:number,
  rows: readonly {table:string;row_key:string;before_json:string|null;after_json:string|null}[], context:ProjectionContext,beforeContext:ProjectionContext=context):Promise<ProjectedCommit> {
  if(sequence<=previous || !Number.isSafeInteger(sequence) || !Number.isSafeInteger(previous) || context.sourceSite!==identity.sourceSite) throw new Error("Invalid committed boundary");
  const beforeRows=new Map<string,ProjectedRecord>(),afterRows=new Map<string,ProjectedRecord>();
  const add=(record:ProjectedRecord|null,destination:Map<string,ProjectedRecord>)=>{if(record) destination.set(JSON.stringify([record.table,record.key]),record);};
  const personas=new Set<number>();
  for(const row of rows) {
    if(!Object.hasOwn(contentDispositionRegistry,row.table)) throw new Error("Unknown committed table");
    const table=row.table as keyof typeof contentDispositionRegistry;
    const before=row.before_json===null?null:await projectCapturedRecord(table,row.row_key,JSON.parse(row.before_json),beforeContext);
    const after=row.after_json===null?null:await projectCapturedRecord(table,row.row_key,JSON.parse(row.after_json),context);
    add(before,beforeRows);add(after,afterRows);
    if(table==="music_entities") for(const member of [...beforeContext.members,...context.members]) if(member.targetUid===null && member.entityIds?.includes(JSON.parse(row.row_key)[0])) personas.add(member.uid);
  }
  for(const uid of personas) for(const [scope,destination] of [[beforeContext,beforeRows],[context,afterRows]] as const) {
    const member=scope.members.find(member=>member.uid===uid);
    if(member) add(await projectCapturedRecord("members",JSON.stringify([uid]),{uid,name:member.name},scope),destination);
  }
  // Same logical identity may switch synthetic/canonical representation in one
  // source commit. Coalesce first so replay never deletes its referenced parent.
  const changes=[...new Set([...beforeRows.keys(),...afterRows.keys()])].flatMap(key=>{
    const before=beforeRows.get(key)??null,after=afterRows.get(key)??null;
    return JSON.stringify(before)===JSON.stringify(after)?[]:[Object.freeze({before,after})];
  });
  const body=JSON.stringify(changes);
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,"0")).join("");
  const result=Object.freeze({identity:Object.freeze({...identity}),sequence,previous,digest,changes:Object.freeze(changes)});
  parsed.add(result);
  return result;
}
