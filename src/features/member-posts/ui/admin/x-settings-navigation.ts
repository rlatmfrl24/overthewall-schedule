export function openXSettings(id: "x-collection-settings" | "x-reference-settings") {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDetailsElement)) return;
  element.open = true;
  element.querySelector("summary")?.focus();
  element.scrollIntoView({ block: "nearest" });
}
