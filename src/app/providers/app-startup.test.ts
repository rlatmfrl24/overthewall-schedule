// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = readFileSync("index.html", "utf8").replace('<div id="root"></div>',
  '<div id="site-content-fallback"><p>공개 일정 본문</p></div><div id="root"></div>');
const open = (options: { javascript?: boolean; theme?: string; systemDark?: boolean; blockedStorage?: boolean } = {}) => {
  document.documentElement.className = "";
  document.head.innerHTML = source.match(/<head>([\s\S]*?)<\/head>/)![1];
  document.body.innerHTML = source.match(/<body>([\s\S]*?)<\/body>/)![1];
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: options.systemDark ?? false }));
  if (options.theme) localStorage.setItem("vite-ui-theme", options.theme);
  if (options.blockedStorage) vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); } });
  // innerHTML leaves scripts inert: execute the actual document bootstrap only for JS-enabled cases.
  if (options.javascript !== false) window.eval(document.getElementById("app-startup")!.textContent!);
  return window;
};
afterEach(() => {
  window.dispatchEvent(new Event("otw:app-ready"));
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("initial document loading", () => {
  it.each([
    ["light", true, "light"], ["dark", false, "dark"],
    ["system", true, "dark"], ["system", false, "light"], [undefined, true, "light"],
  ])("honors theme %s before app startup (system dark=%s)", (theme, systemDark, expected) => {
    const window = open({ theme, systemDark });
    expect(window.document.documentElement.classList.contains(expected)).toBe(true);
    expect(window.getComputedStyle(window.document.getElementById("app-loading")!).display).toBe("grid");
    expect(window.getComputedStyle(window.document.getElementById("site-content-fallback")!).visibility).toBe("hidden");
  });

  it("leaves the server body readable and the loader absent without JavaScript", () => {
    const window = open({ javascript: false });
    expect(window.getComputedStyle(window.document.getElementById("app-loading")!).display).toBe("none");
    expect(window.getComputedStyle(window.document.getElementById("site-content-fallback")!).visibility).toBe("visible");
    expect(window.document.getElementById("site-content-fallback")?.textContent).toContain("공개 일정 본문");
  });

  it("releases loading immediately on app readiness without deleting structured metadata", () => {
    const window = open();
    const metadata = window.document.querySelector('[data-site-seo="canonical"]');
    window.dispatchEvent(new window.Event("otw:app-ready"));
    expect(window.document.documentElement.classList.contains("app-booting")).toBe(false);
    expect(window.document.getElementById("app-loading")).toBeNull();
    expect(window.document.getElementById("site-content-fallback")).toBeNull();
    expect(window.document.getElementById("root")?.hidden).toBe(false);
    expect(metadata?.isConnected).toBe(true);
  });

  it("restores server content when startup fails even if React already replaced its own root", () => {
    const window = open();
    window.document.getElementById("root")!.textContent = "incomplete app";
    window.dispatchEvent(new window.ErrorEvent("error"));
    expect(window.document.getElementById("app-loading")).toBeNull();
    expect(window.document.getElementById("root")?.hidden).toBe(true);
    expect(window.getComputedStyle(window.document.getElementById("site-content-fallback")!).visibility).toBe("visible");
  });

  it("restores the body after a stalled startup and accepts a late ready signal", () => {
    vi.useFakeTimers();
    const window = open();
    vi.advanceTimersByTime(15000);
    expect(window.document.getElementById("root")?.hidden).toBe(true);
    expect(window.document.getElementById("site-content-fallback")).not.toBeNull();
    window.dispatchEvent(new window.Event("otw:app-ready"));
    expect(window.document.getElementById("root")?.hidden).toBe(false);
    expect(window.document.getElementById("site-content-fallback")).toBeNull();
  });

  it("tolerates blocked storage and does not treat an image failure as a bundle failure", () => {
    const window = open({ blockedStorage: true });
    expect(window.document.documentElement.classList.contains("light")).toBe(true);
    const image = window.document.createElement("img");
    window.document.body.append(image);
    image.dispatchEvent(new window.Event("error"));
    expect(window.document.documentElement.classList.contains("app-booting")).toBe(true);
    const script = window.document.querySelector('script[type="module"]')!;
    script.dispatchEvent(new window.Event("error"));
    expect(window.document.documentElement.classList.contains("app-booting")).toBe(false);
  });
});
