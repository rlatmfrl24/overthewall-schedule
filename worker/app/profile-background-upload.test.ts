import {describe,it,expect,vi,afterAll} from "vitest";
import {resolve} from "node:path";
import {mkdtempSync,mkdirSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
const sourceDir=mkdtempSync(resolve('.tmp/profile-upload-test-'));
mkdirSync(resolve(sourceDir,'optimized'));
writeFileSync(resolve(sourceDir,'member.webp'),'fixture bytes');
writeFileSync(resolve(sourceDir,'optimized/member-960.webp'),'fixture bytes');
afterAll(()=>{unlinkSync(resolve(sourceDir,'member.webp'));unlinkSync(resolve(sourceDir,'optimized/member-960.webp'));rmdirSync(resolve(sourceDir,'optimized'));rmdirSync(sourceDir);});
const childProcess=vi.hoisted(()=>({spawnSync:vi.fn(()=>{throw new Error("TEST BLOCKED every real subprocess");})}));
vi.mock("node:child_process",()=>childProcess);
const storage=vi.hoisted(()=>({getPlatformProxy:vi.fn(()=>{throw new Error("TEST BLOCKED every storage runtime");})}));
vi.mock("wrangler",()=>storage);
const upload=await import("../../scripts/upload-profile-backgrounds-to-r2.mjs");
const runner=await import("../../scripts/profile-background-upload-runner");

describe("selected recoverable profile upload CLI",()=>{
  it("imports without spawning and exposes an explicit runner",()=>{
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
    expect(storage.getPlatformProxy).not.toHaveBeenCalled();
    expect(typeof upload.runProfileBackgroundUpload).toBe("function");
  });
  it.each([
    [[],/--site/],[["--site=other","--local"],/site/i],[["--site=luvdia","--local","--config=wrangler.jsonc"],/config/],
    [["--site=otw","--local","--bucket=luvdia-schedule"],/bucket/],
    [["--site=otw","--local","--persist-to=.wrangler/state"],/legacy|persistence/],
    [["--site=otw","--remote"],/confirmation/],
  ] as const)("rejects invalid selected target before runner spawn",async(args,error)=>{
    const spawn=vi.fn();
    expect(()=>upload.runProfileBackgroundUpload([...args,"--operation-id=review"],{spawn,environment:{}})).toThrow(error);
    expect(spawn).not.toHaveBeenCalled();
    await expect(runner.executeProfileBackgroundUpload([...args,"--operation-id=review"])).rejects.toThrow(error);
    expect(storage.getPlatformProxy).not.toHaveBeenCalled();
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
  });
  it("passes an explicit local selection to the injected runner without a direct R2 command",()=>{
    const spawn=vi.fn<NonNullable<NonNullable<Parameters<typeof upload.runProfileBackgroundUpload>[1]>["spawn"]>>(()=>({status:0}));
    const args=["--site=otw","--local","--persist-to=.tmp/sul36-cli-fixture-otw","--operation-id=verified-local",`--source-dir=${sourceDir}`];
    upload.runProfileBackgroundUpload(args,{spawn,environment:{}});
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(args));
    expect(spawn.mock.calls[0][1].join(" ")).toContain("profile-background-upload-runner.ts");
    expect(spawn.mock.calls[0][1]).not.toContain("--remote");
    expect(spawn.mock.calls[0][1]).not.toContain("--force");
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
    expect(storage.getPlatformProxy).not.toHaveBeenCalled();
  });
  it("uses the same versioned local persistence as Wrangler while disabling every remote binding",async()=>{
    await expect(runner.executeProfileBackgroundUpload(["--site=otw","--local","--persist-to=.tmp/sul36-cli-fixture-otw","--operation-id=verified-local",`--source-dir=${sourceDir}`])).rejects.toThrow("TEST BLOCKED every storage runtime");
    expect(storage.getPlatformProxy).toHaveBeenCalledWith({configPath:"wrangler.jsonc",envFiles:[],remoteBindings:false,persist:{path:resolve(".tmp/sul36-cli-fixture-otw/v3")}});
    storage.getPlatformProxy.mockClear();
  });
});
