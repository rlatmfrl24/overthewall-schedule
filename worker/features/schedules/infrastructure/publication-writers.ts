import type { SiteId } from "@contracts/site-definition";
import type { ChzzkScanCommand } from "@contracts/chzzk-scan";
import { commitPublicationBatch, publicationMemberHidden } from "../../content-access";
import { parseCollectorCommand, type CollectorCommand } from "../domain/collector-command";
import type { LiveScheduleCommand } from "../domain/live-schedule-command";
import type { CollectorWriter } from "./collector-writer";
import type { ChzzkScanExecution, ChzzkScanProvider } from "./chzzk-scan-types";
import { allowsAutomaticSchedule } from "./automatic-schedule-policy";
import { isScheduleMemberActive } from "@contracts/schedule-member-policy";

export class D1CollectorWriter implements CollectorWriter {
  private readonly db: D1Database;
  readonly siteId: SiteId;
  constructor(db: D1Database, siteId: SiteId) {this.db=db;this.siteId=siteId;}
  async write(raw: CollectorCommand, statements: D1PreparedStatement[]) {
    const command = parseCollectorCommand(raw);
    if (!command) throw new Error("Invalid collector batch");
    const uid = command.action === "insert_candidate" ? Number(command.item.member_uid) : command.action === "obsolete_candidate" ? command.pending.member_uid : command.target?.memberUid;
    const date = command.action === "insert_candidate" ? String(command.item.date) : command.action === "obsolete_candidate" ? command.pending.date : command.target?.date;
    if (uid && date && !await allowsAutomaticSchedule(this.db, this.siteId, uid, date)) return statements.map(() => ({ results: [] }));
    return commitPublicationBatch(this.db, this.siteId, uid ? [uid] : [], statements);
  }
}

export class D1LiveScheduleWriter {
  private readonly db: D1Database;
  readonly siteId: SiteId;
  constructor(db: D1Database, siteId: SiteId) {this.db=db;this.siteId=siteId;}
  async write(command: LiveScheduleCommand, statements: D1PreparedStatement[]) {
    if (!await allowsAutomaticSchedule(this.db, this.siteId, command.plan.memberUid, command.plan.scheduleDate)) return statements.map(() => ({ results: [] }));
    return commitPublicationBatch(this.db, this.siteId, [command.plan.memberUid], statements);
  }
}

export class D1ChzzkScanWriter {
  private readonly db: D1Database;
  readonly siteId: SiteId;
  constructor(db: D1Database, siteId: SiteId) {this.db=db;this.siteId=siteId;}
  async run(command: ChzzkScanCommand, provider: ChzzkScanProvider, execute: ChzzkScanExecution) {
    const members: ChzzkScanCommand["members"] = [];
    for (const member of command.members) if (isScheduleMemberActive(this.siteId, member.code, command.startDate) && !await publicationMemberHidden(this.db, this.siteId, member.uid)) members.push(member);
    if (!members.length) return { channels: 0, observations: 0, channelResults: [] };
    return execute({ ...command, members }, provider, statements => commitPublicationBatch(this.db, this.siteId, members.map(member => member.uid), statements).then(() => {}));
  }
}
