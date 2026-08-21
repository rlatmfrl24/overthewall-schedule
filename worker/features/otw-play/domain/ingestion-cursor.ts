import { decodeUtf8Base64Url, encodeUtf8Base64Url } from "./utf8-base64url";

export interface IngestionItemCursor {
  position: number;
  id: string;
  classification: string | null;
  status: string | null;
}

export class IngestionCursorError extends Error {
  constructor() {
    super("Invalid ingestion cursor");
    this.name = "IngestionCursorError";
  }
}

export const encodeIngestionItemCursor = (cursor: IngestionItemCursor) =>
  encodeUtf8Base64Url(JSON.stringify({
    v: 2,
    p: cursor.position,
    i: cursor.id,
    c: cursor.classification,
    s: cursor.status,
  }));

export const decodeIngestionItemCursor = (value: string): IngestionItemCursor => {
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as Record<string, unknown>;
    if (
      parsed.v !== 2 ||
      !Number.isSafeInteger(parsed.p) ||
      Number(parsed.p) < 0 ||
      typeof parsed.i !== "string" ||
      !parsed.i ||
      (parsed.c !== null && typeof parsed.c !== "string") ||
      (parsed.s !== null && typeof parsed.s !== "string")
    ) {
      throw new IngestionCursorError();
    }
    return {
      position: Number(parsed.p),
      id: parsed.i,
      classification: parsed.c as string | null,
      status: parsed.s as string | null,
    };
  } catch (error) {
    if (error instanceof IngestionCursorError) throw error;
    throw new IngestionCursorError();
  }
};
