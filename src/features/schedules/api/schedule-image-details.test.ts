// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createScheduleImageDetails, getScheduleImageDetailRegions } from "./schedule-image-details";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([[850, 478], [477, 851], [1, 1]])("covers %sx%s with overlapping bounded regions", (width, height) => {
  const regions = getScheduleImageDetailRegions(width, height);
  expect(regions.map(r => r.region)).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  for (const r of regions) { expect(r.width).toBeGreaterThan(0); expect(r.height).toBeGreaterThan(0); expect(r.x + r.width).toBeLessThanOrEqual(width); expect(r.y + r.height).toBeLessThanOrEqual(height); }
  for (const x of [0, Math.floor(width / 2), width - 1]) for (const y of [0, Math.floor(height / 2), height - 1]) {
    expect(regions.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)).toBe(true);
  }
  if (width > 1) expect(regions[0].x + regions[0].width).toBeGreaterThan(regions[1].x);
});
it("stops cancelled preparation before decoding or uploading", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(createScheduleImageDetails(new File(["x"], "x.png", { type: "image/png" }), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});
it("rejects an oversized original before allocating image buffers", async () => {
  await expect(createScheduleImageDetails(new File([new Uint8Array(10_000_001)], "x.png", { type: "image/png" }))).rejects.toThrow("10MB");
});
it("focuses enlarged views on the selected schedule side without changing source coordinates", () => {
  const left = getScheduleImageDetailRegions(850, 478, "left"), right = getScheduleImageDetailRegions(850, 478, "right");
  expect(Math.max(...left.map(r => r.x + r.width))).toBe(510);
  expect(Math.min(...right.map(r => r.x))).toBe(340);
  expect(left[0]).toMatchObject({ x: 0, y: 0, width: 306, height: 287 });
  expect(right[0]).toMatchObject({ x: 340, y: 0 });
});
it("prepares four bounded PNG views and releases transient browser resources", async () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:details"; } static revokeObjectURL = revoke; });
  vi.stubGlobal("Image", class { src = ""; naturalWidth = 850; naturalHeight = 478; decode = async () => {}; });
  const context = { drawImage: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: "high" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let encoded = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob([new Uint8Array(encoded++ === 0 ? 500_001 : 8)], { type: "image/png" })));
  const file = new File(["original"], "schedule.png", { type: "image/png" });
  const details = await createScheduleImageDetails(file);
  expect(details.map(d => d.name)).toEqual(["top-left.png", "top-right.png", "bottom-left.png", "bottom-right.png"]);
  expect(details.every(d => d.type === "image/png" && d.size <= 500_000)).toBe(true);
  expect(context.drawImage.mock.calls[0].slice(1, 5)).toEqual([0, 0, 510, 287]);
  expect(context.drawImage.mock.calls[0].slice(7)).toEqual([1020, 574]);
  expect(file.size).toBe(8); expect(revoke).toHaveBeenCalledWith("blob:details");
});
