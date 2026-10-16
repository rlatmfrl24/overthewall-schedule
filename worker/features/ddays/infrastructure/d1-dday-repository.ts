import { publicationHiddenSql } from "../../content-access";
import type { SiteId } from "@contracts/site-definition";
import { ddays } from "@db/schema";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { contentRowMovedSql } from "../../content-access";
import type { D1DDayTransitionWriter } from "./d1-dday-transition-writer";
import type { DDayCommand } from "../domain/dday-command";
import type { DDayDto } from "../../../../contracts/ddays";
import type { DbInstance } from "../../../platform/db";
import type {
  DDayRepository,
  DDayWriteInput,
} from "../application/ports/dday-repository";

export class D1DDayRepository implements DDayRepository {
  private readonly db: DbInstance;

  private readonly includeArchived: boolean;

  private readonly writer?: D1DDayTransitionWriter;
  private readonly siteId: SiteId;
  constructor(db: DbInstance, includeArchived = false, writer?:D1DDayTransitionWriter, siteId: SiteId = "otw") {
    this.db = db;
    this.siteId = siteId;
    this.includeArchived = includeArchived;
    this.writer=writer;
  }
  private async write(command:DDayCommand,statement:{toSQL():{sql:string;params:unknown[]}}) {
    const query=statement.toSQL(),prepared=this.db.$client.prepare(query.sql).bind(...query.params);
    return (await this.writer?.write(command,[prepared]))??(await prepared.run()).success;
  }

  async list(): Promise<DDayDto[]> {
    return await this.db.select({
      ...getTableColumns(ddays),
      // Qualify the required column: SQLite can interpret an unknown quoted
      // unqualified identifier as a string instead of rejecting old schemas.
      type: sql<DDayDto["type"]>`ddays.type`,
    }).from(ddays).where(this.includeArchived ? undefined : and(sql.raw(`ddays.content_access = 'normal' AND NOT (${publicationHiddenSql("ddays","ddays",this.siteId)})`),sql.raw(`NOT (${contentRowMovedSql("ddays")})`))).orderBy(ddays.date) as DDayDto[];
  }

  async create(input: DDayWriteInput): Promise<boolean> {
    return this.write({action:"create",input},this.db.insert(ddays).values(input));
  }

  async update(id: number, input: DDayWriteInput): Promise<boolean> {
    return this.write({action:"update",id,input},this.db.update(ddays).set(input).where(eq(ddays.id, id)));
  }

  async remove(id: number): Promise<boolean> {
    return this.write({action:"delete",id},this.db.delete(ddays).where(eq(ddays.id, id)));
  }
}
