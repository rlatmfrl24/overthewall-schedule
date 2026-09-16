import { describe, expect, it } from "vitest";
import { getSnapshotGeometry, getSnapshotUrl, getSnapshotFilename, normalizeSnapshotDesign } from "./snapshot-options";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";

describe("snapshot designs", () => {
  it("defaults old and invalid URLs to the poster", () => {
    for (const input of [undefined, null, "", "unknown", ["legacy"]]) expect(normalizeSnapshotDesign(input)).toBe("poster");
    expect(normalizeSnapshotDesign("legacy")).toBe("legacy");
  });
  it("keeps legacy width separate while ignoring design for grids", () => {
    expect(getSnapshotGeometry("timeline").outputWidth).toBe(720);
    expect(getSnapshotGeometry("timeline", "legacy")).toEqual({ contentWidth: 520, padding: 12, outputWidth: 544 });
    expect(getSnapshotGeometry("grid", "legacy")).toEqual(getSnapshotGeometry("grid", "poster"));
  });
  it("carries the capture state and preserves existing filenames", () => {
    expect(getSnapshotUrl("2026-09-16", "timeline", "dark", "legacy")).toBe("/snapshot?date=2026-09-16&mode=timeline&theme=dark&design=legacy");
    expect(getSnapshotUrl("2026-09-16", "grid", "light", "legacy")).toContain("design=poster");
    expect(getSnapshotFilename("2026-09-16", "timeline")).toBe("오버더월 스케쥴-편성표-2026-09-16.png");
    expect(getSnapshotFilename("2026-09-16", "timeline", "legacy")).toBe("오버더월 스케쥴-기존편성표-2026-09-16.png");
    expect(getSnapshotFilename("2026-09-16", "grid", "legacy")).toBe("오버더월 스케쥴-일정표-2026-09-16.png");
  });
  it("preserves the design in administrator URL state", () => {
    expect(validateConsoleSearch({ tab: "snapshot", design: "legacy", theme: "dark", mode: "timeline" })).toEqual({ tab: "snapshot", design: "legacy", theme: "dark", mode: "timeline" });
    expect(validateConsoleSearch({ design: "invalid" }).design).toBeUndefined();
  });
});
