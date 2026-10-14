import {shapes,subjectFields,type Shape} from "./projected-content";
export type JsonReferencePath=readonly (string|number)[];
/** Array markers are structural, never wildcard text searches through actor data. */
export function jsonReferencePaths(format:string,keys:readonly string[]):JsonReferencePath[] {
  const found:JsonReferencePath[]=[];
  const walk=(shape:Shape,path:JsonReferencePath)=>{
    if(shape==="subject") {
      for(const key of new Set(Object.values(subjectFields).flat())) if(keys.includes(key)) found.push([...path,key]);
    } else if(typeof shape!=="string") {
      if("array" in shape) walk(shape.array,[...path,0]);
      else for(const [key,child] of Object.entries(shape.fields)) {
        if(child==="scalar" && keys.includes(key)) found.push([...path,key]);
        else walk(child,[...path,key]);
      }
    }
  };
  const shape=shapes[format];
  if(format==="member_uids" && keys.includes("memberUid")) return [[0]];
  if(shape) walk(shape,[]);
  return found;
}
export function jsonReferenceQuery(raw:string,path:JsonReferencePath):string {
  const from:string[]=[];
  let value=raw,prefix="$",index=0;
  for(const part of path) {
    if(typeof part==="number") {
      const alias=`ref${index++}`;
      from.push(`json_each(${value},'${prefix}') ${alias}`);
      value=`${alias}.value`;prefix="$";
    } else prefix+=`.${part}`;
  }
  return `SELECT json_extract(${value},'${prefix}') value,json_type(${value},'${prefix}') type${from.length?` FROM ${from.join(" CROSS JOIN ")}`:""}`;
}
