export interface PublicationCommand {id:string;expectedVersion:number;target:"published"|"withdrawn"}
export function parsePublicationCommand(value:unknown):PublicationCommand|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const command=value as Record<string,unknown>;
  return typeof command.id==="string" && command.id.length>0 && command.id.length<=128 && Number.isSafeInteger(command.expectedVersion) && Number(command.expectedVersion)>=0 && (command.target==="published" || command.target==="withdrawn")
    ?{id:command.id,expectedVersion:Number(command.expectedVersion),target:command.target}:null;
}
