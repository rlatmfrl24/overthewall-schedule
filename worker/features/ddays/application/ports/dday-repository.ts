import type { DDayDto } from "../../../../../contracts/ddays";
import type { DDayWriteInput } from "../../domain/dday-command";
export type { DDayWriteInput } from "../../domain/dday-command";

export interface DDayRepository {
  list(): Promise<DDayDto[]>;
  create(input: DDayWriteInput): Promise<boolean>;
  update(id: number, input: DDayWriteInput): Promise<boolean>;
  remove(id: number): Promise<boolean>;
}
