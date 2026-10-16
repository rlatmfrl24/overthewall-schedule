import { describe, expect, it } from "vitest";
import { assertProjectedRecord, decodeProjectedRecord, historicalRecordId, projectCapturedRecord } from "./projected-content";

const context = { sourceSite: "otw" as const, members: [{ uid: 1, targetUid: 10, name: "Bing", externalEntityId: null }, { uid: 90, targetUid: null, name: "Other", externalEntityId: "external-other" }] };
describe("the versioned content projection boundary", () => {
  it("requires the owning file projection port for source and decoded file references", async () => {
    const source={id:2,publisher_member_uid:1,thumbnail_url:"https://source.example/profile/bing.webp"};
    await expect(projectCapturedRecord("notices","[2]",source,context)).rejects.toThrow(/file projection port/i);
    const files={projectReference:()=>"/profile/bing.webp"};
    const record=await projectCapturedRecord("notices","[2]",source,{...context,files});
    expect(record?.value.thumbnail_url).toBe("/profile/bing.webp");
    const target={...context,members:[{uid:10,targetUid:10,name:"Bing",externalEntityId:null}]};
    expect(()=>decodeProjectedRecord(record,target)).toThrow(/file projection port/i);
    expect(()=>decodeProjectedRecord(record,{...target,files})).not.toThrow();
    expect(()=>decodeProjectedRecord({...record,value:{...record?.value,thumbnail_url:source.thumbnail_url}},{...target,files})).toThrow(/unprojected file/i);
  });
  it("preserves local evidence but excludes authenticating actors and source archive control from target content", async () => {
    const source = { id:"p", submitted_by_user_id:"source-clerk", reviewed_by_user_id:"source-admin", content_access:"admin_archive", review_lock_token:"source-lease", idempotency_key:"actor:request", status:"approved", reviewed_at:42,
      approved_performance_snapshot_json:JSON.stringify({ performanceId:"perf", songTitle:"Song", publicationStatus:"members", deletedAt:40, deletedBy:"source-admin", sources:[] }) };
    const projected = await projectCapturedRecord("music_cover_proposals", '["p"]', source, context);
    expect(projected?.value).toMatchObject({submitted_by_user_id:null,reviewed_by_user_id:null,historical_source_site:"otw",historical_review:1,content_access:"normal",status:"approved",reviewed_at:42});
    expect(JSON.stringify(projected)).not.toContain("source-clerk");
    expect(JSON.stringify(projected)).not.toContain("source-admin");
    expect(JSON.stringify(projected)).not.toContain("source-lease");
    expect(source.approved_performance_snapshot_json).toContain("source-admin");
    expect(() => assertProjectedRecord(source as never)).toThrow();
    expect(() => assertProjectedRecord(projected!)).not.toThrow();
  });
  it("keeps approved managed numeric mappings and makes other music credits external", async () => {
    expect((await projectCapturedRecord("music_entities", '["e"]', {id:"e",member_uid:90,display_name:"Other"},context))?.value.member_uid).toBeNull();
    expect((await projectCapturedRecord("music_entities", '["b"]', {id:"b",member_uid:1,display_name:"Bing"},context))?.value.member_uid).toBe(10);
  });
  it("preserves actor-free historical origin/attempt facts with non-credential record identities", async () => {
    const record = await projectCapturedRecord("music_ai_review_attempts", '["live-secret-token"]', {started_at:1,finished_at:2,outcome:"succeeded",review_id:"review",token:"live-secret-token",usage_json:'{"inputTokens":3}'},context);
    expect(record?.destination).toBe("historical");
    expect(record?.value).toEqual({started_at:1,finished_at:2,outcome:"succeeded",review_id:await historicalRecordId("otw","music_ai_reviews",'["review"]')});
    expect(JSON.stringify(record)).not.toContain("live-secret-token");
    expect(JSON.stringify(record)).not.toContain("inputTokens");
  });
  it("rejects unknown fields and nested references rather than guessing or copying arbitrary JSON", async () => {
    await expect(projectCapturedRecord("music_performances", '["p"]', {id:"p",future_actor:"unknown"},context)).rejects.toThrow(/disposition/);
    await expect(projectCapturedRecord("music_performances", '["p"]', {id:"p",broadcast_metadata:'{"performedOn":"2026-10-14","unknownMemberUid":90}'},context)).rejects.toThrow(/shape/);
  });
  it("does not provide a target representation for personal or operational rows", async () => {
    await expect(projectCapturedRecord("music_playlists", '["private"]', {id:"private",owner_user_id:"actor"},context)).rejects.toThrow(/source-only/);
  });
  it("preserves the real playlist job-created event fields as historical content", async () => {
    const detail={playlistId:"public-provider-playlist",mode:"newest",rangeStartPosition:0,requestedItemCount:25};
    const record=await projectCapturedRecord("music_ingestion_events",'["event"]',{id:"event",actor_user_id:"private-admin",event_type:"job.created",detail_json:JSON.stringify(detail)},context);
    expect(record?.value.detail_json).toEqual(detail);
    expect(JSON.stringify(record)).not.toContain("private-admin");
    const work=await projectCapturedRecord("music_ingestion_events",'["work-event"]',{id:"work-event",detail_json:'{"disposition":"held","reason":"Keep original review"}'},context);
    expect(work?.value.detail_json).toEqual({disposition:"held",reason:"Keep original review"});
  });
  it('retains original ingestion response evidence without transferring dispatch keys',async()=>{
    const detail={kind:'video_batch',messageKey:'source-execution-key',nextPageToken:'source-page-token',skippedVideoIds:['selected-video'],observations:[{videoId:'other-video',availabilityStatus:'playable',video:{videoId:'other-video',channelId:'public-channel',title:'Original observation'}}]};
    const record=await projectCapturedRecord('music_ingestion_events','["response"]',{id:'response',detail_json:JSON.stringify(detail)},context);
    expect(record?.value.detail_json).toEqual({kind:'video_batch',skippedVideoIds:detail.skippedVideoIds,observations:detail.observations});
    await expect(projectCapturedRecord('music_ingestion_events','["response"]',{id:'response',detail_json:JSON.stringify({...detail,unreviewedAuthority:'deny'})},context)).rejects.toThrow(/shape/);
  });
  it("requires approved classification and preserves mapped mixed notice credits", async () => {
    const classification={table:"ddays",key:"[1]",disposition:"include" as const,reason:"Reviewed selected anniversary"};
    await expect(projectCapturedRecord("ddays","[1]",{id:1,title:"Anniversary"},context)).rejects.toThrow(/classification/);
    expect((await projectCapturedRecord("ddays","[1]",{id:1,title:"Anniversary"},{...context,classifications:[classification]}))?.destination).toBe("content");
    const notice=await projectCapturedRecord("notices","[2]",{id:2,publisher_member_uid:1,related_member_uids:"[1,90]",historical_related_people:"[]"},context);
    expect(notice?.value).toMatchObject({publisher_member_uid:10,related_member_uids:[10],historical_related_people:[{sourceSite:"otw",sourceRecordId:expect.any(String),name:"Other"}]});
  });
  it("parses approved currently held cache formats without copying unknown provider fields", async () => {
    const examples=[
      ["chzzk_api_cache","vods",{page:0,size:1,totalCount:1,totalPages:1,data:[{videoNo:1,videoTitle:"Held video",channel:{channelId:"channel",channelName:"Bing",channelImageUrl:null}}]}],
      ["chzzk_api_cache","clips",{size:1,page:{next:{clipUID:"next"},prev:null},data:[{clipUID:"clip",clipTitle:"Held clip",ownerChannelId:"channel"}]}],
      ["x_api_cache","posts",{userId:"public-social-user",posts:[{id:"post",text:"Held post",username:"Bing",links:[]}]}],
      ["x_api_cache","linked_user",{user:{id:"public-social-user",username:"Bing",name:"Bing",profile_image_url:null}}],
      ["youtube_api_cache","channel_videos",{shorts:[{videoId:"video",channelId:"channel",title:"Held short",publishedAt:"2026-10-14",duration:30,viewCount:1}]}],
    ] as const;
    for(const [table,type,value] of examples) {
      const approved={...context,classifications:[{table,key:'["cache-key"]',disposition:"include" as const,reason:"Approved selected cache"}]};
      expect((await projectCapturedRecord(table,'["cache-key"]',{key:"cache-key",type,value:JSON.stringify(value)},approved))?.value.value).toEqual(value);
      await expect(projectCapturedRecord(table,'["cache-key"]',{key:"cache-key",type,value:JSON.stringify({...value,unknownExecutionRecord:"must reject"})},approved)).rejects.toThrow(/shape/);
    }
  });
  it("rejects wire images containing dropped nested actors, mismatched keys or unapproved target roster IDs", async () => {
    const projected=await projectCapturedRecord("music_cover_proposals",'["proposal"]',{id:"proposal",status:"approved",approved_performance_snapshot_json:'{"performanceId":"performance","deletedBy":"private-admin"}'},context);
    const targetContext={...context,members:[{uid:10,targetUid:10,name:"Bing",externalEntityId:null}]};
    const valid=JSON.parse(JSON.stringify(projected));
    expect(()=>decodeProjectedRecord(valid,targetContext)).not.toThrow();
    expect(()=>decodeProjectedRecord({...valid,value:{...valid.value,approved_performance_snapshot_json:{performanceId:"performance",deletedBy:"private-admin"}}},targetContext)).toThrow(/unprojected/i);
    expect(()=>decodeProjectedRecord({...valid,key:'["other"]'},targetContext)).toThrow(/key/);
    const member=await projectCapturedRecord("members","[1]",{uid:1,name:"Bing"},context);
    expect(()=>decodeProjectedRecord({...member,key:"[90]",value:{uid:90,name:"Extra"}},targetContext)).toThrow(/roster/);
  });
});
