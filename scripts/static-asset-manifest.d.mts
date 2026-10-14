export const STATIC_ASSET_MANIFEST_PATH: "/profile/__artifact.json";
export function writeStaticAssetManifest(directory:string): {hash:string;entries:Array<{path:string;hash:string;size:number}>};
