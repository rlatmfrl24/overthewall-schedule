export interface AssetObject {
  body: ReadableStream<Uint8Array> | null;
  etag: string;
  httpMetadata: Record<string, string>;
}

export interface AssetReader {
  read(key: string): Promise<AssetObject | null>;
}
