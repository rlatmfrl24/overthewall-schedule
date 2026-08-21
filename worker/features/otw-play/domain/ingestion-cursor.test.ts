import { describe, expect, it } from "vitest";
import {
  decodeIngestionItemCursor,
  encodeIngestionItemCursor,
  IngestionCursorError,
} from "./ingestion-cursor";

describe("OTW Play ingestion item cursor", () => {
  it("round-trips the keyset and filter identity", () => {
    const cursor = {
      position: 100,
      id: "origin-100",
      classification: "eligible",
      status: "ready",
    };
    expect(decodeIngestionItemCursor(encodeIngestionItemCursor(cursor)))
      .toEqual(cursor);
  });

  it("rejects legacy and malformed cursor payloads", () => {
    expect(() => decodeIngestionItemCursor("eyJ2IjoxLCJwIjowLCJpIjoieCJ9"))
      .toThrow(IngestionCursorError);
    expect(() => decodeIngestionItemCursor("not-a-cursor"))
      .toThrow(IngestionCursorError);
  });
});
