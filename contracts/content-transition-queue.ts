export interface TransitionOperationMessage {type:"content-transition.operation";version:1;transitionId:string;operationId:string;payloadHash:string}
export function isTransitionOperationMessage(value:unknown):value is TransitionOperationMessage {
  if(!value || typeof value!=="object" || Array.isArray(value)) return false;
  const message=value as Record<string,unknown>;
  return Object.keys(message).sort().join(",")==="operationId,payloadHash,transitionId,type,version" && message.type==="content-transition.operation" && message.version===1 && typeof message.transitionId==="string" && !!message.transitionId && typeof message.operationId==="string" && !!message.operationId && typeof message.payloadHash==="string" && /^[a-f0-9]{64}$/.test(message.payloadHash);
}
