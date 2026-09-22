import { useCallback, useEffect, useRef } from "react";

/** Unlock audio from the request button's user gesture, before asynchronous work. */
export function useAiReviewSound() {
  const context = useRef<AudioContext | null>(null);
  const ready = useRef<Promise<void> | null>(null);
  const prepare = useCallback(() => {
    try {
      if (typeof AudioContext === "undefined") return;
      context.current ??= new AudioContext();
      if (context.current.state === "suspended") ready.current = context.current.resume().catch(() => {});
    } catch { /* The toast remains available if browser audio is blocked. */ }
  }, []);
  const play = useCallback(async () => {
    const audio = context.current;
    try {
      await ready.current;
      if (!audio || context.current !== audio || audio.state !== "running") return;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch { /* Audio must never interrupt result application or notification. */ }
  }, []);
  useEffect(() => () => {
    const audio = context.current;
    context.current = null;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }, []);
  return { prepare, play };
}
