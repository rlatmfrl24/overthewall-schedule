import type {
  AssetObject,
  AssetReader,
} from "../application/ports/asset-reader";

export class R2AssetReader implements AssetReader {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async read(key: string): Promise<AssetObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    return {
      body: object.body,
      etag: object.httpEtag,
      httpMetadata: Object.fromEntries(headers.entries()),
    };
  }
}
