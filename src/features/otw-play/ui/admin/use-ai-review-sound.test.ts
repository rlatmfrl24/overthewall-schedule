// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAiReviewSound } from "./use-ai-review-sound";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function audioMock() {
  const oscillator = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const audio = {
    state: "suspended", currentTime: 2, destination: {},
    resume: vi.fn(async () => { audio.state = "running"; }),
    close: vi.fn(async () => { audio.state = "closed"; }),
    createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain),
  };
  const construct = vi.fn(function () { return audio; });
  vi.stubGlobal("AudioContext", construct);
  return { audio, oscillator, gain, construct };
}

describe("AI completion sound", () => {
  it("unlocks on request, waits for audio readiness and releases a short beep", async () => {
    const { audio, oscillator, gain, construct } = audioMock();
    let resumed!: () => void;
    audio.resume.mockImplementation(() => new Promise<void>(resolve => { resumed = () => { audio.state = "running"; resolve(); }; }));
    const { result, unmount } = renderHook(useAiReviewSound);
    await act(async () => { await result.current.play(); });
    expect(construct).not.toHaveBeenCalled();
    act(() => result.current.prepare());
    const playing = result.current.play();
    expect(oscillator.start).not.toHaveBeenCalled();
    await act(async () => { resumed(); await playing; });
    expect(oscillator.frequency.value).toBe(660);
    expect(oscillator.start).toHaveBeenCalledWith(2);
    expect(oscillator.stop).toHaveBeenCalledWith(2.2);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 2.18);
    oscillator.onended?.();
    expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
    act(() => result.current.prepare());
    expect(construct).toHaveBeenCalledTimes(1);
    unmount();
    expect(audio.close).toHaveBeenCalledTimes(1);
  });
  it("does not interrupt notifications when audio is unsupported or denied", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { result } = renderHook(useAiReviewSound);
    act(() => result.current.prepare());
    await act(async () => { await result.current.play(); });
    const { audio } = audioMock();
    audio.resume.mockRejectedValue(new Error("audio denied"));
    act(() => result.current.prepare());
    await act(async () => { await result.current.play(); });
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });
});
