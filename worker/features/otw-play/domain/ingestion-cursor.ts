import { decodeUtf8Base64Url, encodeUtf8Base64Url } from "./utf8-base64url";

export interface IngestionItemCursor {
  position: number;
  id: string;
}

export class IngestionCursorError extends Error {
  constructor() {
    super("Invalid ingestion cursor");
    this.name = "IngestionCursorError";
  }
}

export const encodeIngestionItemCursor = (cursor: IngestionItemCursor) =>
  encodeUtf8Base64Url(JSON.stringify({ v: 1, p: cursor.position, i: cursor.id }));

export const decodeIngestionItemCursor = (value: string): IngestionItemCursor => {
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as Record<string, unknown>;
    if (
      parsed.v !== 1 ||
      !Number.isSafeInteger(parsed.p) ||
      Number(parsed.p) < 0 ||
      typeof parsed.i !== "string" ||
      !parsed.i
    ) {
      throw new IngestionCursorError();
    }
    return { position: Number(parsed.p), id: parsed.i };
  } catch (error) {
    if (error instanceof IngestionCursorError) throw error;
    throw new IngestionCursorError();
  }
};
