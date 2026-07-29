import type { AssetReader } from "./ports/asset-reader";

export const readAsset = (reader: AssetReader, key: string) =>
  reader.read(key);
