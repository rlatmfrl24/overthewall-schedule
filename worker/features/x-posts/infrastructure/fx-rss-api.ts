import { parseXml, XmlDeclaration, XmlElement } from "@rgrove/parse-xml";
import type { FxRssPage } from "../ports/fx-rss-collection";
import { FxApiError, parseFxHandle, parseFxId } from "./fx-api";

const invalid = (): never => { throw new FxApiError("fx_invalid_payload"); };
const elements = (parent: XmlElement, name: string) => parent.children.filter((node): node is XmlElement => node instanceof XmlElement && node.name === name);
const single = (parent: XmlElement, name: string) => {
  const nodes = elements(parent, name);
  return nodes.length === 1 ? nodes[0] : invalid();
};

export function parseFxRssFeed(xml: string, targetHandle: string): FxRssPage {
  const target = parseFxHandle(targetHandle);
  try {
    const document = parseXml(xml, { preserveDocumentType: true, preserveXmlDeclaration: true });
    if (document.children.some(node => node.type === "doctype" || node instanceof XmlDeclaration && node.encoding !== null && node.encoding.toLowerCase() !== "utf-8")) return invalid();
    const root = document.root;
    if (!root || root.name !== "rss" || root.attributes.version !== "2.0") return invalid();
    const items = elements(single(root, "channel"), "item");
    if (items.length > 100) return invalid();
    const entries = new Map<string, FxRssPage["entries"][number]>();
    for (const item of items) {
      const guid = single(item, "guid"), date = single(item, "pubDate");
      if (guid.children.some(node => node instanceof XmlElement) || date.children.some(node => node instanceof XmlElement)) return invalid();
      const url = new URL(guid.text.trim());
      const path = /^\/([a-zA-Z0-9_]{1,15})\/status\/(\d{1,25})$/.exec(url.pathname);
      if (url.origin !== "https://x.com" || url.username || url.password || !path) return invalid();
      const handle = parseFxHandle(path[1]), id = parseFxId(path[2]);
      const dateText = date.text.trim(), createdAtHint = Date.parse(dateText);
      // FxRSS emits canonical UTC dates; round-trip rejects date coercion and rollover.
      if (!Number.isFinite(createdAtHint) || new Date(createdAtHint).toUTCString() !== dateText) return invalid();
      if (handle === target && !entries.has(id)) entries.set(id, { id, handle, createdAtHint });
    }
    return { entries: [...entries.values()], rawCount: items.length };
  } catch (error) {
    if (error instanceof FxApiError) throw error;
    return invalid();
  }
}

export async function fetchFxRssFeed(handle: string): Promise<FxRssPage> {
  const target = parseFxHandle(handle);
  try {
    const request = () => fetch(`https://fxtwitter.com/${target}/feed.xml?count=100&with_replies=true`, { headers: { Accept: "application/rss+xml", "User-Agent": "OTWSchedule/1.0 (+https://otw-schedule.info)" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    let response = await request();
    // FxRSS can return a transient, non-cacheable 404 for an existing public account.
    if(response.status===404){
      await response.body?.cancel().catch(()=>undefined);
      response=await request();
    }
    if (!response.ok) throw new FxApiError(`fx_http_${response.status}`);
    if (!response.body) return invalid();
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
    let bytes = 0, xml = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) return invalid();
        try { xml += decoder.decode(value, { stream: true }); } catch { return invalid(); }
      }
      try { xml += decoder.decode(); } catch { return invalid(); }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return parseFxRssFeed(xml, target);
  } catch (error) {
    if (error instanceof FxApiError) throw error;
    throw new FxApiError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "fx_timeout" : "fx_network_error");
  }
}
