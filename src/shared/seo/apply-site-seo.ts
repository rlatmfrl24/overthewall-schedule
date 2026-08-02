import type { SiteSeoMetadata } from "@contracts/site-seo";

const setMeta = (key: string, attribute: "name" | "property", content: string) => {
  const existing = document.head.querySelectorAll<HTMLMetaElement>(
    `meta[data-site-seo="${key}"]`,
  );
  let element = existing[0] ?? null;
  for (const duplicate of [...existing].slice(1)) duplicate.remove();
  if (!element) {
    element = document.createElement("meta");
    element.dataset.siteSeo = key;
    document.head.append(element);
  }
  element.removeAttribute(attribute === "name" ? "property" : "name");
  element.setAttribute(attribute, key);
  element.content = content;
};

export const applySiteSeo = (metadata: SiteSeoMetadata): void => {
  document.documentElement.lang = "ko";
  document.title = metadata.title;
  setMeta("description", "name", metadata.description);
  setMeta("robots", "name", metadata.robots);
  setMeta("og:title", "property", metadata.title);
  setMeta("og:description", "property", metadata.description);
  setMeta("og:url", "property", metadata.canonical);
  setMeta("og:type", "property", metadata.ogType);
  setMeta("twitter:card", "name", "summary");

  const existingCanonical = document.head.querySelectorAll<HTMLLinkElement>(
    'link[data-site-seo="canonical"]',
  );
  let canonical = existingCanonical[0] ?? null;
  for (const duplicate of [...existingCanonical].slice(1)) duplicate.remove();
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.dataset.siteSeo = "canonical";
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = metadata.canonical;

  const imageKeys = ["og:image", "twitter:image"] as const;
  for (const key of imageKeys) {
    if (metadata.image) {
      setMeta(key, key.startsWith("og:") ? "property" : "name", metadata.image);
    } else {
      document.head.querySelector(`meta[data-site-seo="${key}"]`)?.remove();
    }
  }
};
