import type {CollectorCommand} from "../domain/collector-command";
import type {CollectorWriter} from "./collector-writer";
import {D1TransitionRepository} from "../../content-transition";

/** Each write is an original native batch under the existing frozen parent.
 * Re-delivery reads the retained actual rows without admitting another job. */
export class D1ChzzkCollectorWriter implements CollectorWriter {
  get siteId() { return this.repository.siteId; }
  readonly memberScope?:readonly number[];
  hasConflicts=false;
  private readonly repository:D1TransitionRepository;
  private readonly id:string;
  private readonly operationId:string;
  private readonly childKey:string;
  private constructor(repository:D1TransitionRepository,id:string,operationId:string,childKey:string,memberScope?:readonly number[]) {this.repository=repository;this.id=id;this.operationId=operationId;this.childKey=childKey;this.memberScope=memberScope;}
  static async create(repository:D1TransitionRepository,id:string,operationId:string,childKey:string) {
    const context=await repository.chzzkCollectorContext(id,operationId,childKey);
    return new D1ChzzkCollectorWriter(repository,id,operationId,childKey,context.memberScope);
  }
  async write(command:CollectorCommand,statements:D1PreparedStatement[]) {
    const {expectedState}=await this.repository.chzzkCollectorContext(this.id,this.operationId,this.childKey);
    const results=await this.repository.commitChzzkCollectorBatch(this.id,this.operationId,this.childKey,command,statements,expectedState);
    if(results.some(result=>result.conflicted)) this.hasConflicts=true;
    return results;
  }
}
