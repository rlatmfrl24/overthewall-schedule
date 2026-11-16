import { beforeEach, expect, it, vi } from "vitest";
import { readScheduleImage } from "./schedule-image-import";
const mocks=vi.hoisted(()=>({api:vi.fn(),details:vi.fn()}));
vi.mock("@/shared/api/client",()=>({apiFetch:mocks.api}));
vi.mock("./schedule-image-details",()=>({createScheduleImageDetails:mocks.details}));
beforeEach(()=>{vi.clearAllMocks();mocks.api.mockResolvedValue({rows:[]});});
const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"schedule.png",{type:"image/png"});
it("uploads the unchanged original and four detail views in one authenticated request",async()=>{
  const details=["top-left","top-right","bottom-left","bottom-right"].map(r=>new File(["detail"],`${r}.png`,{type:"image/png"}));
  mocks.details.mockResolvedValue(details);
  const signal=new AbortController().signal;await readScheduleImage(file,signal,"left");
  expect(mocks.details).toHaveBeenCalledWith(file,signal,"left");expect(mocks.api).toHaveBeenCalledTimes(1);
  const options=mocks.api.mock.calls[0][1];expect(options).toMatchObject({method:"POST",auth:"required",signal});
  expect([...options.body.keys()]).toEqual(["image","detail","detail","detail","detail"]);
  expect(new Uint8Array(await options.body.get("image").arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
});
it("does not send a charged request when preparation finishes after cancellation",async()=>{
  let finish:(files:File[])=>void=()=>{};mocks.details.mockImplementation(()=>new Promise<File[]>(done=>{finish=done;}));
  const controller=new AbortController(),request=readScheduleImage(file,controller.signal);
  const assertion=expect(request).rejects.toMatchObject({name:"AbortError"});controller.abort();finish([]);await assertion;
  expect(mocks.api).not.toHaveBeenCalled();
});
