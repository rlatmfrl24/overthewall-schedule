import { eq, sql } from "drizzle-orm";
import { ddays } from "@db/schema";
import type { DDayDto } from "../../../../contracts/ddays";
import type { DbInstance } from "../../../platform/db";
import type {
  DDayRepository,
  DDayWriteInput,
} from "../application/ports/dday-repository";

const getErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause instanceof Error
        ? ` ${error.cause.message}`
        : "";
    return `${error.message}${cause}`;
  }
  return String(error);
};

const isMissingDDayTypeColumnError = (error: unknown) => {
  const message = getErrorText(error);
  return (
    message.includes("type") &&
    (message.includes("no such column") ||
      message.includes("no column named"))
  );
};

const warnDDayTypeFallback = () => {
  console.warn(
    "[ddays] ddays.type column is missing; using legacy D-Day query. Run D1 migrations to persist D-Day types.",
  );
};

const legacyDDayFields = {
  id: ddays.id,
  title: ddays.title,
  date: ddays.date,
  description: ddays.description,
  color: ddays.color,
  type: sql<string>`'event'`.as("type"),
  created_at: ddays.created_at,
};

export class D1DDayRepository implements DDayRepository {
  private readonly db: DbInstance;

  constructor(db: DbInstance) {
    this.db = db;
  }

  async list(): Promise<DDayDto[]> {
    try {
      return (await this.db
        .select()
        .from(ddays)
        .orderBy(ddays.date)) as DDayDto[];
    } catch (error) {
      if (!isMissingDDayTypeColumnError(error)) throw error;
      warnDDayTypeFallback();
      return (await this.db
        .select(legacyDDayFields)
        .from(ddays)
        .orderBy(ddays.date)) as DDayDto[];
    }
  }

  async create(input: DDayWriteInput): Promise<boolean> {
    try {
      return (await this.db.insert(ddays).values(input)).success;
    } catch (error) {
      if (!isMissingDDayTypeColumnError(error)) throw error;
      warnDDayTypeFallback();
      const legacyInput = {
        title: input.title,
        date: input.date,
        description: input.description,
        color: input.color,
      };
      return (await this.db.insert(ddays).values(legacyInput)).success;
    }
  }

  async update(id: number, input: DDayWriteInput): Promise<boolean> {
    try {
      return (
        await this.db.update(ddays).set(input).where(eq(ddays.id, id))
      ).success;
    } catch (error) {
      if (!isMissingDDayTypeColumnError(error)) throw error;
      warnDDayTypeFallback();
      const legacyInput = {
        title: input.title,
        date: input.date,
        description: input.description,
        color: input.color,
      };
      return (
        await this.db
          .update(ddays)
          .set(legacyInput)
          .where(eq(ddays.id, id))
      ).success;
    }
  }

  async remove(id: number): Promise<boolean> {
    return (await this.db.delete(ddays).where(eq(ddays.id, id))).success;
  }
}
