import type {CollectorCommand} from "../domain/collector-command";
export type CollectorBatchResult=Pick<D1Result,"results"> & {affectedCount?:number;conflicted?:true};
export interface CollectorWriter {
  readonly siteId?: "otw" | "luvdia";
  readonly memberScope?:readonly number[];
  write(command:CollectorCommand,statements:D1PreparedStatement[]):Promise<CollectorBatchResult[]|null>;
}
