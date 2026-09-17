import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

const STORAGE_KEY = "otw-animations-enabled";
const AnimationContext = createContext({ enabled: true, preferenceEnabled: true, setEnabled: (_enabled: boolean) => { void _enabled; } });
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia?.(REDUCED_MOTION_QUERY);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [preferenceEnabled, updateEnabled] = useState(readPreference);
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false);
  const enabled = preferenceEnabled && !reducedMotion;
  useLayoutEffect(() => {
    document.documentElement.dataset.animations = enabled ? "enabled" : "disabled";
  }, [enabled]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) updateEnabled(readPreference());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setEnabled = (next: boolean) => {
    updateEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The current session remains usable when browser storage is unavailable.
    }
  };
  return (
    <AnimationContext.Provider value={{ enabled, preferenceEnabled, setEnabled }}>
      <MotionConfig reducedMotion={enabled ? "user" : "always"} transition={enabled ? undefined : { duration: 0 }}>
        {children}
      </MotionConfig>
    </AnimationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAnimations = () => useContext(AnimationContext);
