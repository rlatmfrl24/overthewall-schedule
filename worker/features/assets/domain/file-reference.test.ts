import {expect,it} from "vitest";
import {classifyFileReference,validateFileOrigins} from "./file-reference";
import type {TransitionPlan} from "@contracts/content-transition";
const plan={sourceSite:"otw",targetSite:"luvdia",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},fileOrigins:[{kind:"site",site:"otw",origin:"https://otw-schedule.info"},{kind:"external",origin:"https://media.example.com",reason:"Approved external provider media"}]} as unknown as TransitionPlan;
it("projects approved owning URLs into canonical relative paths without changing external-only media",()=>{
  validateFileOrigins(plan);
  expect(classifyFileReference("https://otw-schedule.info/r2-assets/notices/old/../thumbnails/%61.webp?x=1",plan)).toEqual({kind:"owned",path:"/r2-assets/notices/thumbnails/a.webp",site:"otw",resource:"otw-schedule"});
  expect(classifyFileReference("/profile/%62ing_hayu.webp",plan)).toMatchObject({kind:"owned",path:"/profile/bing_hayu.webp"});
  expect(classifyFileReference("https://media.example.com/profile/bing_hayu.webp",plan)).toEqual({kind:"external",url:"https://media.example.com/profile/bing_hayu.webp"});
});
it("rejects missing origin classification and conflicting resource mappings",()=>{
  expect(()=>classifyFileReference("https://unknown.example.com/profile/bing_hayu.webp",plan)).toThrow(/classification/);
  expect(()=>classifyFileReference("https://unknown.example.com/r2-assets/notices/thumbnails/a.webp",plan)).toThrow(/classification/);
  expect(()=>validateFileOrigins({...plan,fileOrigins:[{kind:"r2",site:"otw",origin:"https://bucket.example.com",resource:"luvdia-schedule"}]})).toThrow(/resource/);
  expect(()=>validateFileOrigins({...plan,fileOrigins:[...plan.fileOrigins!,{kind:"external",origin:"https://otw-schedule.info",reason:"Conflict"}]})).toThrow(/conflict/);
});
