import type { SiteId } from "../../../../contracts/site-definition";
import type { TransitionPlan } from "../../../../contracts/content-transition";
import { contentDispositionRegistry, CONTENT_DISPOSITION_VERSION } from "./disposition-registry";
import { historicalReferences } from "./historical-references";
import {normalizeOtwPlaySearchText} from "../../../../contracts/otw-play-search";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Shape = "scalar" | "drop" | "subject" | "member_changed_field" | { array: Shape } | { fields: Record<string, Shape> };
export const memberChangedFields:readonly string[]=["submissionKind","broadcast","youtubeUrl","title","suggestedSongId","tags","originalArtists","participants","note"];
export const subjectFields={member:["kind","memberUid"],entity:["kind","entityId"],new_external:["kind","clientKey","displayName","entityKind"]} as const;
const object = (fields: Record<string, Shape>): Shape => ({ fields });
const array = (item: Shape): Shape => ({ array:item });
const scalars = (names: string): Record<string, Shape> => Object.fromEntries(names.split(" ").map(name=>[name,"scalar"]));
const broadcast = object(scalars("performedOn dateEvidence originalUrl extent"));
const range = object(scalars("startSeconds endSeconds"));
const artist = object({subject:"subject",...scalars("creditOrder isPrimary")});
const participant = object({subject:"subject",...scalars("participantRole creditOrder creditNameSnapshot")});
const song = object({...scalars("kind songId title isOtwOriginal originalReleaseDate originalReleasePrecision"), aliases:array(object(scalars("alias locale aliasKind"))), originalArtists:array(artist), tags:array("scalar")});
const review = object({broadcast,song,participants:array(participant),performanceTags:array("scalar"),...scalars("relationType releaseType participationType startSeconds endSeconds internalNote")});
const person = object({...scalars("name entityKind role"),sourceNames:array("scalar"),subject:"subject"});
const aiValues = object({song:object({...scalars("title existingSongId"),alternateTitles:array("scalar"),originalArtists:array(person),tags:array("scalar"),candidates:array(object(scalars("id title")))}),participants:array(person),classification:object(scalars("relationType releaseType")),performanceTags:array("scalar"),segment:range,broadcastDate:broadcast,...scalars("participationType originalUrl extent")});
const aiFieldNames = "song participants classification participationType performanceTags segment broadcastDate originalUrl extent";
const evidence = array(object(scalars("source text seconds")));
const aiResult = object({videoAnalyzed:"scalar",warnings:array("scalar"),songs:array(object({values:aiValues,evidence:object(Object.fromEntries(aiFieldNames.split(" ").map(key=>[key,evidence]))),warnings:array("scalar")}))});
const media = array(object(scalars("mediaKey type url previewImageUrl width height altText")));
const metrics = object(scalars("likeCount replyCount repostCount quoteCount"));
const linkedPost = object({...scalars("id text createdAt url username name profileImageUrl"),metrics,media});
const snapshot = object({...scalars("performanceId songId songTitle relationType releaseType publicationStatus deletedAt deletionEventId"),deletedBy:"drop",broadcast,sources:array(object(scalars("sourceId videoId startSeconds endSeconds")))});
const video = object({...scalars("videoId channelId channelTitle title thumbnailUrl durationSeconds publishedAt availabilityStatus madeForKids scopeReview description privacyStatus actualStartTime"),tags:array("scalar")});
const observation=object({...scalars('videoId availabilityStatus'),video});
export const shapes: Record<string, Shape> = {
  strings:array("scalar"),member_uids:array("scalar"),schedule_ids:array("scalar"),notice_links:array(object(scalars("label url"))),
  historical_people:array(object(scalars("sourceSite sourceRecordId name"))), broadcast,range,review_input:review,approved_snapshot:snapshot,
  ai_input:object({video,range,candidateKind:"scalar",members:array(object({name:"scalar",aliases:array("scalar")})),promptVersion:"scalar"}),
  ai_result:aiResult,
  ai_selection:object({candidates:array(object(scalars("id version"))),filters:object(scalars("source jobId candidateKind"))}),
  x_post:object({...scalars("id text createdAt url username"),metrics,media,links:array(object({...scalars("url expandedUrl displayUrl resolvedUrl domain title description imageUrl siteName previewStatus"),linkedPost})),quote:object({postId:"scalar",post:linkedPost}),reply:object({...scalars("postId conversationId inReplyToUserId targetUsername"),post:linkedPost})}),
  ingestion_event:object({...scalars("sourceKind candidateKind sourceExternalId sourceUrl sourceTitle importMode playlistId mode disposition requestedItemCount rangeStartPosition status reason code outcome linkedPerformanceId performanceId candidateId beforeKind afterKind title version expectedVersion errorCode messageCount classification kind incomplete totalResults"),messageKey:'drop',nextPageToken:'drop',items:array(object(scalars('videoId playlistItemId position'))),unavailableItems:array(object(scalars('playlistItemId position'))),skippedVideoIds:array('scalar'),observations:array(observation),observation,changedFields:array("scalar"),catalogMaterialized:object(scalars("entityCount songCreated")),beforeReview:review,reviewInput:review}),
  catalog_event:object({changedFields:array("member_changed_field"),...scalars("id entityId songId performanceId proposalId candidateId title displayName normalizedName slug entityKind memberUid version status relationType releaseType participationType publicationStatus qualityStatus internalNote updatedAt createdAt reviewedAt reviewResultCode reviewNote submittedTitle submittedUrl youtubeVideoId reason code previousStatus nextStatus expectedVersion deletedAt deletionEventId songTitle archived draftPerformanceCount withdrawnPerformanceCount sourceCount externalChannelId verificationStatus creationMode videoId channelRole active resultCode"),historicalMember:object(scalars("sourceSite sourceRecordId name")),actorUserId:"drop",submittedByUserId:"drop",reviewedByUserId:"drop",deletedBy:"drop",broadcast,reviewInput:review,beforeReview:review,participants:array(participant),originalArtists:array(artist),tags:array("scalar"),entityIds:array("scalar"),sources:array(object(scalars("sourceId videoId startSeconds endSeconds sourceRole priority isPrimary")))}),
};
export const cacheShapes:Record<string,Record<string,Shape>>={
  chzzk_cache:{
    vods:object({...scalars("page size totalCount totalPages"),data:array(object({...scalars("videoNo videoId videoTitle videoType publishDate thumbnailImageUrl trailerUrl duration readCount publishDateAt categoryType videoCategory videoCategoryValue channelId channelName channelImageUrl"),channel:object(scalars("channelId channelName channelImageUrl"))}))}),
    clips:object({size:"scalar",page:object({next:object({clipUID:"scalar"}),prev:object({clipUID:"scalar"})}),data:array(object(scalars("clipUID videoNo clipTitle ownerChannelId thumbnailImageUrl categoryType clipCategory duration adult createdDate readCount blindType hasStreamerClips")))}),
  },
  x_cache:{
    posts:object({userId:"scalar",posts:array(shapes.x_post)}),
    linked_post:object({post:linkedPost}),
    user:object({user:object(scalars("id username name profile_image_url protected"))}),
    linked_user:object({user:object(scalars("id username name profile_image_url protected"))}),
    relation_version:object({version:"scalar"}),
  },
  // The retired producer's held channel-video format. Unknown legacy shapes
  // require manifest conflict resolution; no arbitrary JSON fallback exists.
  youtube_cache:{channel_videos:object(Object.fromEntries(["videos","shorts"].map(key=>[key,array(object(scalars("videoId title publishedAt thumbnailUrl duration viewCount channelId channelTitle isShort")))])))},
};
export const knownJsonFormats=Object.freeze([...Object.keys(shapes),...Object.keys(cacheShapes)]);
function shapeFor(name:string,row:Record<string,unknown>):Shape {
  const shape=shapes[name]??cacheShapes[name]?.[String(row.type)];
  if(!shape) throw new Error(`Unresolved known JSON shape: ${name}/${String(row.type)}`);
  return shape;
}
/** Runtime-only collaboration with the owning file classifier, bound to the
 * approved manifest by infrastructure. Never part of a projected envelope. */
export interface FileReferenceProjection {
  projectReference(raw:string):string;
}
export interface ProjectionContext {
  sourceSite: SiteId;
  members: readonly { uid:number; targetUid:number|null; name:string; externalEntityId:string|null;firstCommit?:number;canonicalPresent?:boolean;present?:boolean;entityIds?:readonly string[] }[];
  entities?:readonly {sourceId:string;targetId:string}[];
  classifications?:TransitionPlan["classifications"];
  files?:FileReferenceProjection;
}
function projectFileReferences(table:string,value:Record<string,JsonValue>,context:ProjectionContext):void {
  if(!["notices","member_profile_images","naver_cafe_posts"].includes(table)) return;
  const projectUrl=(raw:JsonValue):JsonValue=>{
    if(typeof raw!=="string" || !raw.trim()) return raw;
    if(!context.files) throw new Error("Missing owning file projection port");
    return context.files.projectReference(raw);
  };
  for(const field of ["image_url","thumbnail_url"]) if(value[field]!==undefined) value[field]=projectUrl(value[field]);
  if(Array.isArray(value.image_urls)) value.image_urls=value.image_urls.map(projectUrl);
  else if(typeof value.image_urls==="string") value.image_urls=JSON.stringify((JSON.parse(value.image_urls) as JsonValue[]).map(projectUrl));
}
function classification(table:string,key:string,value:Record<string,unknown>,context:ProjectionContext):"include"|"exclude" {
  const decisions=context.classifications?.filter(item=>item.table===table && item.key===key)??[];
  if(decisions.length>1 || decisions.some(item=>!item.reason.trim())) throw new Error(`Conflicting manifest classification: ${table}/${key}`);
  if(decisions[0]) return decisions[0].disposition;
  if(table==="notices") {
    const related=typeof value.related_member_uids==="string"?JSON.parse(value.related_member_uids):value.related_member_uids;
    const uids=[value.publisher_member_uid,...(Array.isArray(related)?related:[])];
    if(context.members.some(member=>member.targetUid!==null && uids.includes(member.uid))) return "include";
  }
  throw new Error(`Unresolved manifest classification: ${table}/${key}`);
}
function parseShape(value: unknown, shape: Shape, context: ProjectionContext, path: string): JsonValue | undefined {
  if (shape==="drop") return undefined;
  if(typeof shape==='object' && 'array' in shape && shape.array==='member_changed_field' && !Array.isArray(value)) throw new Error(`Invalid member changed fields at ${path}`);
  if(shape==="member_changed_field") {
    if(typeof value!=="string" || !memberChangedFields.includes(value)) throw new Error(`Unknown member changed field at ${path}`);
    return value;
  }
  if (value===null) return null;
  if (shape==="scalar") {
    if (["string","boolean"].includes(typeof value) || typeof value==="number" && Number.isFinite(value)) return value as string|number|boolean;
    throw new Error(`Unknown JSON shape at ${path}`);
  }
  if (shape==="subject") {
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error(`Unknown subject shape at ${path}`);
    const subject = value as Record<string,unknown>;
    const fields=subjectFields[subject.kind as keyof typeof subjectFields] as readonly string[]|undefined;
    const allowed=fields?.join(" ")??"";
    if (!fields || fields.some(key=>!Object.hasOwn(subject,key)) || Object.keys(subject).some(key=>!fields.includes(key))) throw new Error(`Unknown subject shape at ${path}`);
    if(subject.kind==="entity" && (typeof subject.entityId!=="string" || !subject.entityId)) throw new Error(`Unresolved entity reference at ${path}`);
    if(subject.kind==="entity") return {kind:"entity",entityId:context.entities?.find(entity=>entity.sourceId===subject.entityId)?.targetId??subject.entityId as string};
    if (subject.kind==="member") {
      const member = context.members.find(item=>item.uid===subject.memberUid);
      if (!member) throw new Error(`Unresolved member reference at ${path}`);
      if (member.targetUid!==null) return {kind:"member",memberUid:member.targetUid};
      if (!member.externalEntityId) throw new Error(`Unresolved external credit at ${path}`);
      return {kind:"entity",entityId:member.externalEntityId};
    }
    return parseShape(subject,object(scalars(allowed)),context,path);
  }
  if (typeof shape==="string") throw new Error(`Unknown JSON shape at ${path}`);
  if ("array" in shape) {
    if (!Array.isArray(value)) throw new Error(`Unknown JSON array shape at ${path}`);
    return value.map((item,i)=>parseShape(item,shape.array,context,`${path}[${i}]`) ?? null);
  }
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error(`Unknown JSON object shape at ${path}`);
  const result: Record<string,JsonValue> = {};
  for (const [key,child] of Object.entries(value)) {
    if (!Object.hasOwn(shape.fields,key)) throw new Error(`Unknown JSON shape field ${path}.${key}`);
    const mapped=key==="entityId" && typeof child==="string"?context.entities?.find(entity=>entity.sourceId===child)?.targetId??child:key==="entityIds" && Array.isArray(child)?child.map(id=>context.entities?.find(entity=>entity.sourceId===id)?.targetId??id):child;
    const parsed = parseShape(mapped,shape.fields[key],context,`${path}.${key}`);
    if (parsed!==undefined) result[key]=parsed;
  }
  return result;
}
export function projectBusinessJson(value:unknown,format:string,context:ProjectionContext):JsonValue {
  const shape=shapes[format];
  if(!shape) throw new Error("Unregistered business JSON format");
  return parseShape(value,shape,context,format)??null;
}
export interface ProjectedRecord {
  readonly version: typeof CONTENT_DISPOSITION_VERSION;
  readonly table: keyof typeof contentDispositionRegistry;
  readonly key: string;
  readonly sourceSite: SiteId;
  readonly sourceRecordId: string;
  readonly destination: "content" | "historical";
  readonly value: Readonly<Record<string,JsonValue>>;
}
// A cast of a source row is not proof that the parser ran. A transport decoder
// must invoke this same projector before obtaining a target-writable value.
const projected = new WeakSet<object>();
function freezeJson(value:JsonValue):void {
  if(value && typeof value==="object") { for(const child of Object.values(value)) freezeJson(child); Object.freeze(value); }
}
/** Validates the projected wire/storage format, never the source-local image. */
export function decodeProjectedRecord(raw:unknown,context:ProjectionContext):ProjectedRecord {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Invalid projection envelope");
  const envelope=raw as Record<string,unknown>;
  if(Object.keys(envelope).sort().join(",")!=="destination,key,sourceRecordId,sourceSite,table,value,version" || envelope.version!==CONTENT_DISPOSITION_VERSION || envelope.sourceSite!==context.sourceSite || typeof envelope.table!=="string" || !Object.hasOwn(contentDispositionRegistry,envelope.table)) throw new Error("Invalid projection identity");
  const registry=contentDispositionRegistry[envelope.table as keyof typeof contentDispositionRegistry];
  const destination=registry.destination==="classification"?"content":registry.destination;
  if(!["content","historical"].includes(destination) || envelope.destination!==destination || typeof envelope.key!=="string" || typeof envelope.sourceRecordId!=="string" || !/^[a-f0-9]{64}$/.test(envelope.sourceRecordId)) throw new Error("Invalid projected disposition");
  if(!envelope.value || typeof envelope.value!=="object" || Array.isArray(envelope.value)) throw new Error("Invalid projected value");
  const value=envelope.value as Record<string,JsonValue>;
  if(registry.destination==="classification" && classification(envelope.table,envelope.key,value,context)!=="include") throw new Error("Excluded manifest row");
  const expectedKey=registry.destination==="historical"?JSON.stringify([envelope.sourceRecordId]):JSON.stringify(registry.primaryKey.map(column=>value[column]));
  if(envelope.key!==expectedKey || registry.destination!=="historical" && registry.primaryKey.some(column=>typeof value[column]!=="string" && (typeof value[column]!=="number" || !Number.isFinite(value[column])))) throw new Error("Projected primary key mismatch");
  for(const column of envelope.table==="members"?["uid"]:["member_uid","submitted_member_uid","publisher_member_uid"]) {
    if(value[column]!==null && value[column]!==undefined && !context.members.some(member=>member.targetUid!==null && member.targetUid===value[column])) throw new Error("Unapproved target roster reference");
  }
  const allowed=new Set<string>([...registry.values,...Object.keys(registry.json)]);
  for(const [column,item] of Object.entries(value)) {
    if(column==="content_access" && item==="normal" && (registry.excluded as readonly string[]).includes(column)) continue;
    if(envelope.table==="music_cover_proposals" && ["submitted_by_user_id","reviewed_by_user_id","review_lock_token","review_lock_expires_at"].includes(column) && item===null) continue;
    if(envelope.table==="music_cover_proposals" && column==="idempotency_key" && item===envelope.sourceRecordId) continue;
    if(!allowed.has(column) || registry.destination==="historical" && (registry.primaryKey as readonly string[]).includes(column)) throw new Error(`Source-only/unknown projection field ${column}`);
    const shape=(registry.json as Record<string,string>)[column];
    const parsed=parseShape(item,shape?shapeFor(shape,value):"scalar",context,`${envelope.table}.${column}`);
    if(JSON.stringify(parsed)!==JSON.stringify(item)) throw new Error(`Unprojected nested data at ${envelope.table}.${column}`);
    if(item!==null && Object.hasOwn(historicalReferences[envelope.table]??{},column) && (typeof item!=="string" || !/^[a-f0-9]{64}$/.test(item))) throw new Error("Unprojected historical execution reference");
  }
  const fileProjection={...value};
  projectFileReferences(envelope.table,fileProjection,context);
  if(JSON.stringify(fileProjection)!==JSON.stringify(value)) throw new Error("Unprojected file reference");
  freezeJson(value);
  const record=Object.freeze({...envelope,value}) as unknown as ProjectedRecord;
  projected.add(record);
  return record;
}
export function assertProjectedRecord(record: ProjectedRecord): void {
  if (!projected.has(record)) throw new Error("A parsed versioned projection is required");
}
export async function historicalRecordId(site: SiteId, table: string, sourceKey: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([CONTENT_DISPOSITION_VERSION,site,table,sourceKey])));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export async function projectCapturedRecord(table: keyof typeof contentDispositionRegistry, sourceKey: string, raw: unknown, context: ProjectionContext): Promise<ProjectedRecord|null> {
  const registry = contentDispositionRegistry[table];
  if (registry.destination==="source_only" || registry.destination==="rebuild") throw new Error(`A source-only/rebuilt table cannot be projected: ${table}`);
  if (!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Captured record must be an object");
  const columns = new Set<string>([...registry.values,...registry.excluded,...Object.keys(registry.json)]);
  const source = raw as Record<string,unknown>;
  if(registry.destination==="classification" && classification(table,sourceKey,source,context)==="exclude") return null;
  if(table==="settings") throw new Error("Unresolved settings value policy; manifest must not copy arbitrary credentials/configuration");
  for (const key of Object.keys(source)) if (!columns.has(key)) throw new Error(`Missing column disposition: ${table}.${key}`);
  const value: Record<string,JsonValue> = {};
  for (const column of registry.values) if (Object.hasOwn(source,column)) value[column]=parseShape(source[column],"scalar",context,`${table}.${column}`) ?? null;
  for (const [column,shapeName] of Object.entries(registry.json)) if (Object.hasOwn(source,column)) {
    const shape = shapeFor(shapeName,source);
    const parsed = typeof source[column]==="string" ? JSON.parse(source[column] as string) : source[column];
    value[column] = parseShape(parsed,shape,context,`${table}.${column}`) ?? null;
  }
  const origin = await historicalRecordId(context.sourceSite,table,sourceKey);
  if(table==="notices") {
    const related=value.related_member_uids;
    const people=Array.isArray(value.historical_related_people)?[...value.historical_related_people]:[];
    const uids=new Set([...(Array.isArray(related)?related:[]),...(value.publisher_member_uid===null || value.publisher_member_uid===undefined?[]:[value.publisher_member_uid])]);
    for(const uid of uids) {
      const member=context.members.find(item=>item.uid===uid);
      if(!member) throw new Error("Unresolved notice member reference");
      if(member.targetUid===null) people.push({sourceSite:context.sourceSite,sourceRecordId:await historicalRecordId(context.sourceSite,"members",JSON.stringify([uid])),name:member.name});
    }
    if(Array.isArray(related)) value.related_member_uids=related.flatMap(uid=>{const member=context.members.find(item=>item.uid===uid)!;return member.targetUid===null?[]:[member.targetUid];});
    if(value.publisher_member_uid!==null && value.publisher_member_uid!==undefined) value.publisher_member_uid=context.members.find(item=>item.uid===value.publisher_member_uid)!.targetUid;
    value.historical_related_people=people;
  }
  if(table==="music_catalog_events") for(const column of ["before_json","after_json","detail_json"]) {
    const detail=value[column];
    if(detail && typeof detail==="object" && !Array.isArray(detail) && detail.memberUid!==null && detail.memberUid!==undefined) {
      const member=context.members.find(item=>item.uid===detail.memberUid);
      if(!member) throw new Error("Unresolved historical member reference");
      detail.memberUid=member.targetUid;
      if(member.targetUid===null) detail.historicalMember={sourceSite:context.sourceSite,sourceRecordId:await historicalRecordId(context.sourceSite,"members",JSON.stringify([member.uid])),name:member.name};
    }
  }
  if (registry.destination==="historical") {
    // Historical identities are opaque links, never usable source execution keys.
    for (const key of registry.primaryKey) delete value[key];
    for (const foreign of registry.foreignKeys) {
      const target=contentDispositionRegistry[foreign.table as keyof typeof contentDispositionRegistry];
      if(target.destination!=="historical") continue;
      const keys=foreign.columns.map(column=>source[column]);
      if(keys.some(key=>key===undefined || key===null)) continue;
      const reference=await historicalRecordId(context.sourceSite,foreign.table,JSON.stringify(keys));
      for(const column of foreign.columns) if(Object.hasOwn(value,column)) value[column]=reference;
    }
    for(const [column,target] of Object.entries(historicalReferences[table]??{})) {
      if(source[column]!==undefined && source[column]!==null) value[column]=await historicalRecordId(context.sourceSite,target,JSON.stringify([source[column]]));
    }
    if(table==="music_ai_review_batches" && value.selection_json && typeof value.selection_json==="object" && !Array.isArray(value.selection_json)) {
      const filters=value.selection_json.filters;
      if(filters && typeof filters==="object" && !Array.isArray(filters) && typeof filters.jobId==="string") filters.jobId=await historicalRecordId(context.sourceSite,"music_ingestion_jobs",JSON.stringify([filters.jobId]));
    }
  }
  if (table==="members") {
    const member = context.members.find(item=>item.uid===source.uid);
    if (!member) throw new Error("Unresolved managed member mapping");
    if (member.targetUid===null) {
      if(member.canonicalPresent!==false || member.present===false) return null;
      if(!member.externalEntityId || typeof source.name!=="string") throw new Error("Missing sealed external member persona");
      const normalized=normalizeOtwPlaySearchText(source.name);
      if(!normalized) throw new Error("Manifest external persona name conflict");
      const entity=await projectCapturedRecord("music_entities",JSON.stringify([member.externalEntityId]),{id:member.externalEntityId,member_uid:null,entity_kind:"person",display_name:source.name,normalized_name:normalized,slug:member.externalEntityId,archived_at:null,version:0,created_at:0,updated_at:0},context);
      const persona=Object.freeze({...entity!,sourceRecordId:origin});projected.add(persona);return persona;
    }
    value.uid=member.targetUid;
  }
  if(table==="music_entities" && typeof value.id==="string") value.id=context.entities?.find(entity=>entity.sourceId===value.id)?.targetId??value.id;
  for(const foreign of registry.foreignKeys) if(foreign.table==="music_entities") for(const column of foreign.columns) {
    if(typeof value[column]==="string") value[column]=context.entities?.find(entity=>entity.sourceId===value[column])?.targetId??value[column];
  }
  for (const column of ["member_uid","submitted_member_uid"] as const) if (value[column]!==undefined && value[column]!==null) {
    const member = context.members.find(item=>item.uid===value[column]);
    if (!member) throw new Error(`Unresolved member reference: ${table}.${column}`);
    if (member.targetUid===null && !["music_entities","music_cover_proposal_participants","music_cover_proposal_original_artists"].includes(table)) return null;
    value[column]=member.targetUid;
  }
  if ((registry.excluded as readonly string[]).includes("content_access")) value.content_access="normal";
  projectFileReferences(table,value,context);
  if (table==="music_cover_proposals") Object.assign(value,{submitted_by_user_id:null,reviewed_by_user_id:null,idempotency_key:origin,review_lock_token:null,review_lock_expires_at:null,historical_source_site:context.sourceSite,historical_source_record_id:origin,historical_review:["approved","rejected"].includes(String(value.status))?1:0});
  freezeJson(value);
  const mappedKey=JSON.stringify(registry.primaryKey.map(column=>value[column] ?? source[column]));
  const result: ProjectedRecord = Object.freeze({version:CONTENT_DISPOSITION_VERSION,table,key:mappedKey,sourceSite:context.sourceSite,sourceRecordId:origin,destination:registry.destination==="classification"?"content":registry.destination,value});
  // Credential-bearing execution keys remain source-local and never enter an
  // exported historical identity, even if they happened to be a source PK.
  const record = registry.destination==="historical" ? Object.freeze({...result,key:JSON.stringify([origin])}) : result;
  projected.add(record);
  return record;
}
