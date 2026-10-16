// D1 documents a 2,000,000-byte row/string limit. This checks the actual
// persisted representation, not an arbitrary lower content/product limit.
export const D1_MAX_VALUE_BYTES=2_000_000;
export function assertD1String(value:string):void {
  if(new TextEncoder().encode(value).byteLength>D1_MAX_VALUE_BYTES) throw new Error("Encoded transition value exceeds the D1 2,000,000-byte string limit");
}
export function assertD1Row(values:readonly (string|number|null)[]):void {
  // SQLite record header: <=9 bytes per serial type plus its header varint;
  // integer bodies use <=8 bytes. The bounded overhead is storage, not content.
  const bytes=9+values.length*9+values.reduce<number>((sum,value)=>sum+(typeof value==="string"?new TextEncoder().encode(value).byteLength:typeof value==="number"?8:0),0);
  if(bytes>D1_MAX_VALUE_BYTES) throw new Error("Encoded transition row exceeds the D1 2,000,000-byte row limit");
}
