// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useAiReviewForm, type AiFormSnapshots } from "./ai-review-form";
import type { AiReviewSuggestion } from "@contracts/otw-play-ai-review";
const snapshots: AiFormSnapshots = {
  song: [],
  participants: [],
  classification: [],
  participationType: "solo",
  performanceTags: [],
  segment: ["0", ""],
  broadcastDate: [],
  originalUrl: null,
  extent: null,
};
const suggestion: AiReviewSuggestion = {
  values: {
    participationType: "duet",
    segment: { startSeconds: 20, endSeconds: 120 },
  },
  evidence: {},
  warnings: [],
};
afterEach(cleanup);
describe("AI form merge", () => {
  it("protects explicit clearing, saved values and edits made while analysis runs", () => {
    const apply = vi.fn(),
      restore = vi.fn();
    const { result, rerender } = renderHook(
      ({ values }) =>
        useAiReviewForm("video", values, apply, restore, ["participationType"]),
      { initialProps: { values: snapshots } },
    );
    act(() => result.current.begin());
    act(() => result.current.touch("segment"));
    rerender({ values: { ...snapshots, segment: ["", ""] } });
    act(() => result.current.receive(suggestion));
    expect(apply).not.toHaveBeenCalled();
    act(() => result.current.receive(suggestion, "participationType"));
    expect(apply).toHaveBeenCalledWith("participationType", "duet");
  });
  it("fills defaults, undoes only fields not subsequently edited and resets on target change", () => {
    const apply = vi.fn(),
      restore = vi.fn();
    const { result, rerender } = renderHook(
      ({ scope }) => useAiReviewForm(scope, snapshots, apply, restore),
      { initialProps: { scope: "a" } },
    );
    act(() => result.current.begin());
    act(() => result.current.receive(suggestion));
    expect(apply).toHaveBeenCalledTimes(2);
    act(() => result.current.touch("segment"));
    act(() => result.current.undo());
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith("participationType", "solo");
    rerender({ scope: "b" });
    apply.mockClear();
    act(() => result.current.receive(suggestion));
    expect(apply).not.toHaveBeenCalled();
  });
  it("does not auto-bind an ambiguous song even if a generated value has the correct shape", () => {
    const apply = vi.fn();
    const { result } = renderHook(() =>
      useAiReviewForm("a", snapshots, apply, vi.fn()),
    );
    act(() => result.current.begin());
    act(() =>
      result.current.receive({
        values: {
          song: {
            title: "Same",
            originalArtists: [],
            tags: [],
            existingSongId: null,
            candidates: [
              { id: "1", title: "Same" },
              { id: "2", title: "Same" },
            ],
          },
        },
        evidence: {},
        warnings: [],
      }),
    );
    expect(apply).not.toHaveBeenCalled();
  });
});
