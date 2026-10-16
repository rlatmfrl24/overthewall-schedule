import type {
  AssetObject,
  AssetReader,
} from "../application/ports/asset-reader";

export class R2AssetReader implements AssetReader {
  private readonly bucket: R2Bucket;
  private readonly db?:D1Database;

  constructor(bucket: R2Bucket, db?:D1Database) {
    this.bucket = bucket;
    this.db=db;
  }

  async read(key: string): Promise<AssetObject | null> {
    const version=this.db?await this.db.prepare("SELECT version_key FROM asset_file_references WHERE logical_key=?").bind(key).first<string>("version_key"):null;
    const object = await this.bucket.get(version??key);
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
