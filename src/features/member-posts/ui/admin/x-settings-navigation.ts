export function openXSettings(id: "x-collection-settings" | "x-reference-settings" | "x-feed-settings") {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDetailsElement)) return;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  element.open = true;
  element.querySelector("summary")?.focus();
  element.scrollIntoView({ block: "nearest" });
}
