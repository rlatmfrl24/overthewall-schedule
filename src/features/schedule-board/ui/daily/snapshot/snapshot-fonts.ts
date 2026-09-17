import { createContext } from "react";

export type SnapshotFontMode = "loading" | "web" | "system";
export const SnapshotFontContext = createContext<SnapshotFontMode>("loading");
export const SYSTEM_FONT_FAMILY = "system-ui, sans-serif";
export const SNAPSHOT_FONT_FAMILY =
  '"OTW Snapshot Poppins", "OTW Snapshot Pretendard", system-ui, sans-serif';
export const SNAPSHOT_FONT_TIMEOUT = 3_000;
export const SNAPSHOT_SYSTEM_FONT_EVENT = "otw:snapshot-system-fonts";
export const SNAPSHOT_FONT_READ_EVENT = "otw:snapshot-read-fonts";

const fonts = [
  ...[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => ({
    family: "OTW Snapshot Poppins",
    url: `/fonts/poppins-5.3.0/poppins-latin-${weight}-normal.woff2`,
    weight: String(weight),
  })),
  { family: "OTW Snapshot Pretendard", url: "/fonts/pretendard-1.3.9/PretendardVariable.woff2", weight: "100 900" },
] as const;

export interface SnapshotFonts {
  mode: "web" | "system";
  css: string;
  faces: FontFace[];
}

const systemFonts = (): SnapshotFonts => ({ mode: "system", css: "", faces: [] });

function toDataUrl(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:font/woff2;base64,${btoa(binary)}`;
}

// Validate the same bytes used for rendering and PNG embedding. html-to-image's
// default font fetcher swallows failures, so it cannot establish this contract.
export async function prepareSnapshotFonts(signal: AbortSignal): Promise<SnapshotFonts> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const fallback = new Promise<SnapshotFonts>((resolve) => {
    onAbort = () => {
      controller.abort();
      resolve(systemFonts());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(onAbort, SNAPSHOT_FONT_TIMEOUT);
    if (signal.aborted) onAbort();
  });
  const load = async (): Promise<SnapshotFonts> => {
    const prepared = await Promise.all(fonts.map(async ({ family, url, weight }) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`snapshot-font-http-${response.status}`);
      const bytes = await response.arrayBuffer();
      const face = await new FontFace(family, bytes, { weight, style: "normal" }).load();
      return {
        face,
        css: `@font-face{font-family:"${family}";src:url("${toDataUrl(bytes)}") format("woff2");font-style:normal;font-weight:${weight};}`,
      };
    }));
    return { mode: "web", faces: prepared.map(({ face }) => face), css: prepared.map(({ css }) => css).join("\n") };
  };
  try {
    return await Promise.race([load().catch(() => {
      controller.abort();
      return systemFonts();
    }), fallback]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

// Same-origin iframe handoff: keep multi-megabyte embedded CSS out of DOM
// attributes and out of the public route/query contract.
export function readSnapshotFonts(root: HTMLElement): Pick<SnapshotFonts, "mode" | "css"> {
  const detail: { result?: Pick<SnapshotFonts, "mode" | "css"> } = {};
  const EventClass = root.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
  root.dispatchEvent(new EventClass(SNAPSHOT_FONT_READ_EVENT, { detail }));
  if (!detail.result) throw new Error("snapshot-font-state-missing");
  return detail.result;
}

export function forceSystemSnapshotFonts(root: HTMLElement) {
  // Invalidate synchronously so the caller cannot observe the previous ready
  // frame while React commits the new font and text measurements.
  root.dataset.snapshotReady = "false";
  const EventClass = root.ownerDocument.defaultView?.Event ?? Event;
  root.dispatchEvent(new EventClass(SNAPSHOT_SYSTEM_FONT_EVENT));
}
