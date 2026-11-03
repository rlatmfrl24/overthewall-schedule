import { WorkerEntrypoint } from "cloudflare:workers";
import { unavailableXApiGateway, type XApiGatewayReceiptRequest, type XApiGatewayRequest, type XActivityControlResult } from "@contracts/x-activity";
import type { Env } from "../platform/types";
import { buildXGateway } from "./x-gateway";
import { buildXActivityCoordinator, buildXActivitySite } from "./x-activity";
import type { XActivityUserIdentity } from "@contracts/x-activity";
import { XActivityError } from "../features/x-posts";
import type { XCollectionProvider } from "@contracts/x-collection";

export class XActivityCoordinatorRpc extends WorkerEntrypoint<Env> {
  async protocol() { return { version: 1, site: this.env.SITE_ID ?? "" }; }
  async gatewayForLuvdia(input: XApiGatewayRequest) {
    if (this.env.SITE_ID !== "otw") return unavailableXApiGateway.execute(input);
    return buildXGateway(this.env,"luvdia").execute(input);
  }
  async budgetForLuvdia(){
    if(this.env.SITE_ID!=="otw")return unavailableXApiGateway.readBudget();
    return buildXGateway(this.env,"luvdia").readBudget();
  }
  async receiptForLuvdia(input: XApiGatewayReceiptRequest) {
    if (this.env.SITE_ID !== "otw") throw new Error("x_activity_wrong_coordinator");
    return buildXGateway(this.env, "luvdia").readReceipt!(input);
  }
  async redactForLuvdia(postId:string){
    if(this.env.SITE_ID!=="otw")throw new Error("x_activity_wrong_coordinator");
    await buildXGateway(this.env,"luvdia").redactPost(postId);
  }
  async statusForLuvdia(){
    if(this.env.SITE_ID!=="otw")throw new Error("x_activity_wrong_coordinator");
    return buildXActivityCoordinator(this.env).status("luvdia");
  }
  async controlForLuvdia(action:"start"|"stop"):Promise<XActivityControlResult>{
    try{
      if(this.env.SITE_ID!=="otw"||!["start","stop"].includes(action))throw new XActivityError("x_activity_invalid_control",400);
      const coordinator=buildXActivityCoordinator(this.env);
      return {ok:true,value:await(action==="start"?coordinator.start("luvdia"):coordinator.stop("luvdia"))};
    }catch(error){return {ok:false,error:error instanceof Error?error.message:"x_activity_unavailable",status:error instanceof XActivityError?error.status:503};}
  }
  async setCollectionForLuvdia(source:XCollectionProvider):Promise<XActivityControlResult>{
    try{
      if(this.env.SITE_ID!=="otw"||!["fxembed","x_api"].includes(source))throw new XActivityError("invalid_x_collection_provider",400);
      return {ok:true,value:await buildXActivityCoordinator(this.env).setPrimarySource("luvdia",source)};
    }catch(error){return {ok:false,error:error instanceof Error?error.message:"x_collection_unavailable",status:error instanceof XActivityError?error.status:503};}
  }
}

export class XActivitySiteRpc extends WorkerEntrypoint<Env> {
  async protocol() { return { version: 1, site: this.env.SITE_ID ?? "" }; }
  #local(){if(this.env.SITE_ID!=="luvdia")throw new Error("x_activity_wrong_site");return buildXActivitySite(this.env);}
  async snapshot(){return this.#local().snapshot();}
  async rememberUser(handle:string,user:XActivityUserIdentity){return this.#local().rememberUser(handle,user);}
  async accept(body:unknown){return this.#local().accept(body);}
  async events(){return this.#local().events();}
  async setRecoveryInterval(){return this.#local().setRecoveryInterval();}
  async setPrimarySource(source:XCollectionProvider){return this.#local().setPrimarySource(source);}
  async setWebhookDisabled(disabled:boolean){return this.#local().setWebhookDisabled(disabled);}
}
