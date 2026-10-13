import { D1WorkQueueRepository, WorkQueueService, D1IngestionRepository, YouTubeOtwPlayMetadataReader, type WorkQueueMessage } from "../features/otw-play";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayAiBatchService } from "./ai-review";
import type { Env } from "../platform/types";

export const createOtwPlayWorkQueueService=(env:Env)=>new WorkQueueService(
  new D1WorkQueueRepository(env.otw_db),new D1IngestionRepository(env.otw_db),createOtwPlayIngestionService(env),createOtwPlayAiBatchService(env),
  new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,priority:"core",origin:"otw_play_ingestion"}),
  async message=>{
    if (!env.OTW_PLAY_INGESTION_QUEUE) throw new Error("OTW Play ingestion queue is not configured");
    await env.OTW_PLAY_INGESTION_QUEUE.send(message);
  },()=>crypto.randomUUID(),Date.now,
);
export const isWorkQueueMessage=(body:unknown):body is WorkQueueMessage=>{
  if (!body || typeof body !== "object") return false;
  const v=body as Partial<WorkQueueMessage>;
  return v.kind === "otw_play_work_queue" && v.schemaVersion === 1 && (v.target === "queue" || v.target === "batch") && typeof v.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v.id);
};
