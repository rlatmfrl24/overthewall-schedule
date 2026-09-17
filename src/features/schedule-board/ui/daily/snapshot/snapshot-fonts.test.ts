// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSnapshotFonts, SNAPSHOT_FONT_TIMEOUT } from "./snapshot-fonts";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function installFonts(load: () => Promise<unknown> = () => Promise.resolve()) {
  vi.stubGlobal("FontFace", class {
    family: string;
    constructor(family: string) { this.family = family; }
    async load() { await load(); return this; }
  });
}

describe("snapshot font preparation", () => {
  it("embeds every Poppins weight and Pretendard using the exact fetched bytes", async () => {
    installFonts();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([119, 79, 70, 50]).buffer }));
    const result = await prepareSnapshotFonts(new AbortController().signal);
    expect(result.mode).toBe("web");
    expect(result.faces.map(face => face.family)).toEqual([...Array(9).fill("OTW Snapshot Poppins"), "OTW Snapshot Pretendard"]);
    expect(result.css.match(/data:font\/woff2;base64,d09GMg==/g)).toHaveLength(10);
    for (const weight of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(result.css).toContain(`font-weight:${weight};`);
      expect(fetch).toHaveBeenCalledWith(`/fonts/poppins-5.3.0/poppins-latin-${weight}-normal.woff2`, expect.anything());
    }
    expect(result.css).not.toContain("https:");
  });

  it("uses system fonts on HTTP failure", async () => {
    installFonts();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await prepareSnapshotFonts(new AbortController().signal)).toEqual({ mode: "system", faces: [], css: "" });
  });

  it("uses system fonts when embedding bytes cannot be decoded as a font", async () => {
    installFonts(() => Promise.reject(new Error("bad font")));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect((await prepareSnapshotFonts(new AbortController().signal)).mode).toBe("system");
  });

  it("bounds stalled downloads to three seconds and aborts outstanding requests", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    }));
    const result = prepareSnapshotFonts(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(SNAPSHOT_FONT_TIMEOUT);
    expect((await result).mode).toBe("system");
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles immediately on cancellation without leaving a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const controller = new AbortController();
    const result = prepareSnapshotFonts(controller.signal);
    controller.abort();
    expect((await result).mode).toBe("system");
    expect(vi.getTimerCount()).toBe(0);
  });
});
