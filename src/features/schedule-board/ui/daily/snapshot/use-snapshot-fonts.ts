import { useEffect, useState, type RefObject } from "react";
import {
  prepareSnapshotFonts, SNAPSHOT_FONT_READ_EVENT, SNAPSHOT_SYSTEM_FONT_EVENT,
  type SnapshotFonts, type SnapshotFontMode,
} from "./snapshot-fonts";

export function useSnapshotFonts(rootRef: RefObject<HTMLDivElement | null>) {
  const [fonts, setFonts] = useState<SnapshotFonts | null>(null);
  const mode: SnapshotFontMode = fonts?.mode ?? "loading";

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = new AbortController();
    let active = true;
    let faces: FontFace[] = [];
    const useSystem = () => {
      controller.abort();
      setFonts({ mode: "system", css: "", faces: [] });
    };
    root.addEventListener(SNAPSHOT_SYSTEM_FONT_EVENT, useSystem);
    void prepareSnapshotFonts(controller.signal).then((prepared) => {
      if (!active || controller.signal.aborted) return;
      faces = prepared.faces;
      for (const face of faces) root.ownerDocument.fonts.add(face);
      setFonts(prepared);
    });
    return () => {
      active = false;
      controller.abort();
      root.removeEventListener(SNAPSHOT_SYSTEM_FONT_EVENT, useSystem);
      for (const face of faces) root.ownerDocument.fonts.delete(face);
    };
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !fonts) return;
    const read = (event: Event) => {
      (event as CustomEvent).detail.result = { mode: fonts.mode, css: fonts.css };
    };
    root.addEventListener(SNAPSHOT_FONT_READ_EVENT, read);
    return () => root.removeEventListener(SNAPSHOT_FONT_READ_EVENT, read);
  }, [rootRef, fonts]);

  return mode;
}
