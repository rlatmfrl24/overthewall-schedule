export const isXPostId = (value:unknown): value is string => typeof value === "string" && /^[1-9]\d{4,24}$/.test(value);
