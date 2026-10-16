import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type { TransitionOperationMessage } from "../../../../contracts/content-transition-queue";
import type { NoticeCommand } from "../domain/notice-command";

export class D1NoticeTransitionWriter {
  private readonly repository: D1TransitionRepository;
  private readonly site: "otw" | "luvdia";

  private readonly resume?: TransitionOperationMessage;
  constructor(repository: D1TransitionRepository,site: "otw" | "luvdia",resume?: TransitionOperationMessage) {
    this.repository = repository; this.site = site; this.resume = resume;
  }

  private async commit(id:string,operationId:string,generation:number,statements:D1PreparedStatement[]):Promise<Array<Pick<D1Result,"success">>> {
    try {
      const result=await this.repository.commit(id,operationId,generation,statements);
      if(result) return result.businessResults;
    } catch(error) {
      const actual=await this.repository.exportOperation(id,operationId);
      if(actual.outcome?.outcome!=="committed" || !actual.outcome.sideEffectReconciled) throw error;
    }
    const actual=await this.repository.exportOperation(id,operationId);
    if(actual.outcome?.outcome!=="committed" || !actual.outcome.sideEffectReconciled) throw new Error("Missing committed notice outcome");
    return [{success:true}]; // Authoritative original outcome; no invented D1 metadata.
  }

  async write(command: NoticeCommand, statements: D1PreparedStatement[]): Promise<Array<Pick<D1Result,"success">>> {
    if (this.resume) {
      const original = await this.repository.exportOperation(this.resume.transitionId, this.resume.operationId);
      const executable = await this.repository.readExecutableCommand(this.resume.transitionId, this.resume.operationId);
      const { expectedRows: ignored, ...stored } = executable.payload; void ignored;
      if (original.payloadHash !== this.resume.payloadHash || executable.codec.id !== "notices.mutate" || JSON.stringify(command) !== JSON.stringify(stored)) throw new Error("Notice resume identity conflict");
      const owner = await this.repository.readTransition(this.resume.transitionId);
      return this.commit(owner.id, original.operationId, owner.generation, statements);
    }
    const prepared = await this.repository.prepareNoticeMutation(command);
    const transition = prepared.transition;
    if (!transition) return this.repository.commitUnselectedNotice(command, prepared.expectedRows, statements);
    const source = transition.sourceSite === this.site;
    if (source && ["source_fenced", "target_owned", "complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED", transition.targetSite);
    const operationId = crypto.randomUUID(), now = Date.now();
    const input = { transitionId: transition.id, operationId, idempotencyKey: operationId,
      codec: { id: source ? "notices.local" : "notices.mutate", version: 1 },
      kind: command.action === "delete" ? "intentional_removal" as const : "content_edit" as const,
      subject: { table: "notices", key: JSON.stringify([source || command.action === "create" ? null : command.id]) }, expectedVersion: null,
      validation: { contract: 1, validatedAt: now }, admittedAt: now,
      payload: source ? { action: command.action, affectedIds: prepared.selectedIds } : { ...command, expectedRows: prepared.expectedRows } };
    try {
      if (source) return (await this.repository.commitLocalNotice(input, command, prepared.expectedRows, statements))?.businessResults ?? [];
      await this.repository.admit(input);
      return await this.commit(transition.id, operationId, transition.generation, statements);
    } catch (error) {
      const current = await this.repository.readTransition(transition.id);
      if (source && ["source_fenced", "target_owned", "complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED", transition.targetSite);
      if (String(error).includes("Expected version conflict") || String(error).includes("malformed JSON")) throw new TransitionWriteError("CONTENT_CONFLICT", this.site, operationId);
      throw error;
    }
  }
}
