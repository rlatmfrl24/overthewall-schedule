import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

const STORAGE_KEY = "otw-animations-enabled";
const AnimationContext = createContext({ enabled: true, setEnabled: (_enabled: boolean) => { void _enabled; } });

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [enabled, updateEnabled] = useState(readPreference);
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
    <AnimationContext.Provider value={{ enabled, setEnabled }}>
      <MotionConfig reducedMotion={enabled ? "never" : "always"} transition={enabled ? undefined : { duration: 0 }}>
        {children}
      </MotionConfig>
    </AnimationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAnimations = () => useContext(AnimationContext);
