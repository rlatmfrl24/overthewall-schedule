import { ddays } from "@db/schema";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type { DDayDto } from "../../../../contracts/ddays";
import type { DbInstance } from "../../../platform/db";
import type {
  DDayRepository,
  DDayWriteInput,
} from "../application/ports/dday-repository";

export class D1DDayRepository implements DDayRepository {
  private readonly db: DbInstance;

  constructor(db: DbInstance) {
    this.db = db;
  }

  async list(): Promise<DDayDto[]> {
    return await this.db.select({
      ...getTableColumns(ddays),
      // Qualify the required column: SQLite can interpret an unknown quoted
      // unqualified identifier as a string instead of rejecting old schemas.
      type: sql<DDayDto["type"]>`ddays.type`,
    }).from(ddays).orderBy(ddays.date) as DDayDto[];
  }

  async create(input: DDayWriteInput): Promise<boolean> {
    return (await this.db.insert(ddays).values(input)).success;
  }

  async update(id: number, input: DDayWriteInput): Promise<boolean> {
    return (await this.db.update(ddays).set(input).where(eq(ddays.id, id))).success;
  }

  async remove(id: number): Promise<boolean> {
    return (await this.db.delete(ddays).where(eq(ddays.id, id))).success;
  }
}
