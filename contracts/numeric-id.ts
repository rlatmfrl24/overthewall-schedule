export const parseNumericId = (value?: string | number | null) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};
