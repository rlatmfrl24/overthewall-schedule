import type { DDayDto, DDayType } from "../../../../../contracts/ddays";

export interface DDayWriteInput {
  title: string;
  date: string;
  description: string | null;
  color: string | null;
  type: DDayType;
}

export interface DDayRepository {
  list(): Promise<DDayDto[]>;
  create(input: DDayWriteInput): Promise<boolean>;
  update(id: number, input: DDayWriteInput): Promise<boolean>;
  remove(id: number): Promise<boolean>;
}
