import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const evidenceDir = path.dirname(new URL(import.meta.url).pathname).replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const appPort = Number(process.env.SNAPSHOT_APP_PORT ?? 5317);
const cdpPort = Number(process.env.SNAPSHOT_CDP_PORT ?? 9223);
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = `http://127.0.0.1:${appPort}`;
const snapshotDate = "2026-05-29";

const liveStatusRequests = [];

async function main() {
  await waitForHttp(`${baseUrl}/snapshot?date=${snapshotDate}&mode=timeline&theme=light`);

  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "otw-snapshot-chrome-"),
  );
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-features=OptimizationGuideModelDownloading",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ]);

  try {
    const pageWsUrl = await waitForPageWebSocket(cdpPort);
    const cdp = await connectCdp(pageWsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (params) => {
      const url = new URL(params.request.url);
      if (url.pathname.startsWith("/api/live-status")) {
        liveStatusRequests.push(params.request.url);
      }
    });

    const captures = [
      {
        name: "grid-light",
        mode: "grid",
        theme: "light",
        viewport: { width: 1320, height: 900 },
      },
      {
        name: "grid-dark",
        mode: "grid",
        theme: "dark",
        viewport: { width: 1320, height: 900 },
      },
      {
        name: "timeline-light",
        mode: "timeline",
        theme: "light",
        viewport: { width: 560, height: 900 },
      },
      {
        name: "timeline-dark",
        mode: "timeline",
        theme: "dark",
        viewport: { width: 560, height: 900 },
      },
    ];

    const results = [];

    for (const capture of captures) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: capture.viewport.width,
        height: capture.viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const url = `${baseUrl}/snapshot?date=${snapshotDate}&mode=${capture.mode}&theme=${capture.theme}`;
      await cdp.send("Page.navigate", { url });
      await waitForSnapshotReady(cdp, capture.name);

      const assertions = await assertSnapshot(cdp);
      const clip = await getRootClip(cdp);
      const screenshot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      });

      const screenshotPath = path.join(evidenceDir, `after-${capture.name}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({
        ...capture,
        screenshot: path.basename(screenshotPath),
        ...assertions,
      });
    }

    if (liveStatusRequests.length > 0) {
      throw new Error(
        `Snapshot unexpectedly requested live status: ${liveStatusRequests.join(", ")}`,
      );
    }

    const summaryPath = path.join(evidenceDir, "browser-assertions.json");
    await fs.writeFile(
      summaryPath,
      `${JSON.stringify({ liveStatusRequests, results }, null, 2)}\n`,
    );

    await cdp.close();
  } finally {
    chrome.kill();
    await waitForProcessExit(chrome, 5000);
    await delay(300);
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function assertSnapshot(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const headerText = document.querySelector("header")?.innerText ?? "";
      const bodyText = document.body.innerText;
      const missingDate = !headerText.includes("2026년 5월 29일");
      const forbiddenHeaderTerms = ["멤버", "비어 있음", "LIVE"].filter((term) => headerText.includes(term));
      const forbiddenBodyTerms = ["LIVE", "방송 중", "현재 방송 중입니다", "미등록 LIVE"].filter((term) => bodyText.includes(term));
      return { headerText, missingDate, forbiddenHeaderTerms, forbiddenBodyTerms };
    })()`,
  });

  const assertions = result.result.value;
  if (assertions.missingDate) {
    throw new Error(`Snapshot header did not include the date: ${assertions.headerText}`);
  }
  if (assertions.forbiddenHeaderTerms.length > 0) {
    throw new Error(
      `Snapshot header still includes removed chip terms: ${assertions.forbiddenHeaderTerms.join(", ")}`,
    );
  }
  if (assertions.forbiddenBodyTerms.length > 0) {
    throw new Error(
      `Snapshot body still includes live terms: ${assertions.forbiddenBodyTerms.join(", ")}`,
    );
  }
  return assertions;
}

async function waitForSnapshotReady(cdp, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const ready = document.querySelector("[data-snapshot-ready='true']");
        const images = Array.from(document.images);
        return Boolean(ready) && images.every((img) => img.complete && img.naturalWidth > 0);
      })()`,
    });
    if (result.result.value) return;
    await delay(100);
  }
  const diagnostics = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      href: window.location.href,
      bodyText: document.body.innerText,
      snapshotReady: document.querySelector("[data-snapshot-root='true']")?.getAttribute("data-snapshot-ready") ?? null,
      rootExists: Boolean(document.querySelector("[data-snapshot-root='true']")),
      images: Array.from(document.images).map((img) => ({
        src: img.getAttribute("src"),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })),
    }))()`,
  });
  await fs.writeFile(
    path.join(evidenceDir, `ready-timeout-${label}.json`),
    `${JSON.stringify(diagnostics.result.value, null, 2)}\n`,
  );
  throw new Error("Timed out waiting for snapshot readiness.");
}

async function getRootClip(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const root = document.querySelector("[data-snapshot-root='true']");
      if (!root) throw new Error("snapshot root missing");
      const rect = root.getBoundingClientRect();
      return {
        x: Math.max(0, rect.left + window.scrollX),
        y: Math.max(0, rect.top + window.scrollY),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        scale: 1,
      };
    })()`,
  });
  return result.result.value;
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPageWebSocket(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools target.");
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();

  return new Promise((resolve, reject) => {
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          const messageId = (id += 1);
          ws.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((messageResolve, messageReject) => {
            pending.set(messageId, { resolve: messageResolve, reject: messageReject });
          });
        },
        on(method, handler) {
          const current = listeners.get(method) ?? [];
          current.push(handler);
          listeners.set(method, current);
        },
        close() {
          ws.close();
        },
      });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const handlers = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          handlers.reject(new Error(message.error.message));
        } else {
          handlers.resolve(message.result ?? {});
        }
        return;
      }

      const methodListeners = listeners.get(message.method) ?? [];
      for (const listener of methodListeners) {
        void listener(message.params);
      }
    };
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    childProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

await main();
