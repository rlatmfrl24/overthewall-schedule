import { and, desc, eq } from "drizzle-orm";
import { schedules } from "../../src/db/schema";
import type { DbInstance } from "../db";
import type { UpdateLogPayload } from "../types";
import { insertUpdateLog } from "../utils/helpers";

type SaveScheduleInput = {
  id?: number | null;
  member_uid: number;
  date: string;
  start_time?: string | null;
  title?: string | null;
  status: "방송" | "휴방" | "게릴라" | "미정";
};

type SaveScheduleActor = Pick<
  UpdateLogPayload,
  "actorId" | "actorName" | "actorIp"
>;

const isExclusiveStatus = (status: string) =>
  status === "휴방" || status === "게릴라" || status === "미정";

const findInsertedScheduleId = async (
  db: DbInstance,
  input: SaveScheduleInput,
) => {
  const rows = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(
      and(
        eq(schedules.member_uid, input.member_uid),
        eq(schedules.date, input.date),
        eq(schedules.status, input.status),
      ),
    )
    .orderBy(desc(schedules.id))
    .limit(1);

  return rows[0]?.id ?? null;
};

const deleteScheduleWithLog = async (
  db: DbInstance,
  schedule: typeof schedules.$inferSelect,
  actor: SaveScheduleActor,
) => {
  await db.delete(schedules).where(eq(schedules.id, schedule.id));
  await insertUpdateLog(db, {
    scheduleId: schedule.id,
    memberUid: schedule.member_uid,
    scheduleDate: schedule.date,
    action: "delete",
    title: schedule.title ?? null,
    previousStatus: schedule.status,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorIp: actor.actorIp,
  });
};

export const saveScheduleWithConflicts = async (
  db: DbInstance,
  input: SaveScheduleInput,
  actor: SaveScheduleActor,
) => {
  const existing = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.date, input.date),
        eq(schedules.member_uid, input.member_uid),
      ),
    );

  if (input.status === "미정") {
    for (const schedule of existing) {
      await deleteScheduleWithLog(db, schedule, actor);
    }

    return {
      success: true,
      action: "delete_conflicts" as const,
      scheduleId: null,
      deletedIds: existing.map((schedule) => schedule.id),
    };
  }

  const schedulesToDelete = isExclusiveStatus(input.status)
    ? existing.filter((schedule) => schedule.id !== input.id)
    : existing.filter(
        (schedule) =>
          schedule.id !== input.id && isExclusiveStatus(schedule.status),
      );

  for (const schedule of schedulesToDelete) {
    await deleteScheduleWithLog(db, schedule, actor);
  }

  const payload = {
    member_uid: input.member_uid,
    date: input.date,
    start_time: input.start_time ?? null,
    title: input.title ?? null,
    status: input.status,
  };

  if (input.id) {
    const before = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, input.id))
      .limit(1);

    await db.update(schedules).set(payload).where(eq(schedules.id, input.id));
    await insertUpdateLog(db, {
      scheduleId: input.id,
      memberUid: input.member_uid,
      scheduleDate: input.date,
      action: "update",
      title: input.title ?? null,
      previousStatus: before[0]?.status ?? null,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
    });

    return {
      success: true,
      action: "update" as const,
      scheduleId: input.id,
      deletedIds: schedulesToDelete.map((schedule) => schedule.id),
    };
  }

  await db.insert(schedules).values(payload);
  const scheduleId = await findInsertedScheduleId(db, input);
  await insertUpdateLog(db, {
    scheduleId,
    memberUid: input.member_uid,
    scheduleDate: input.date,
    action: "create",
    title: input.title ?? null,
    previousStatus: null,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorIp: actor.actorIp,
  });

  return {
    success: true,
    action: "create" as const,
    scheduleId,
    deletedIds: schedulesToDelete.map((schedule) => schedule.id),
  };
};
