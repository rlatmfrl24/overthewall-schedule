export interface CatalogDeleteCommand {kind:"entity"|"song"|"performance"|"channel";id:string;expectedVersion:number}
export function parseCatalogDeleteCommand(value:unknown):CatalogDeleteCommand|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const command=value as Record<string,unknown>;
  return ["entity","song","performance","channel"].includes(String(command.kind)) && typeof command.id==="string" && command.id.length>0 && command.id.length<=128 && Number.isSafeInteger(command.expectedVersion) && Number(command.expectedVersion)>=0
    ?{kind:command.kind as CatalogDeleteCommand["kind"],id:command.id,expectedVersion:Number(command.expectedVersion)}:null;
}
