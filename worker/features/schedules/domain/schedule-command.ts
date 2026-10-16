import { parseNumericId } from "../../../../contracts/numeric-id";
import { parseScheduleInput } from "./schedule-input";

export type ScheduleCommand = {
  action: "save" | "create" | "update";
  input: { id: number | null; member_uid: number; date: string; start_time: string | null; title: string | null; status: "방송" | "휴방" | "게릴라" | "미정" };
} | { action: "delete"; id: number };

/** The same normalized request drives immediate and transferred execution. */
export function parseScheduleCommand(value: unknown): ScheduleCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.action === "delete") {
    if(typeof candidate.id!=="number" && typeof candidate.id!=="string") return null;
    const id = parseNumericId(candidate.id);
    return id === null ? null : { action: "delete", id };
  }
  if (!["save", "create", "update"].includes(String(candidate.action))) return null;
  const action = candidate.action as "save" | "create" | "update";
  const input = parseScheduleInput(candidate.input, { requireId: action === "update" });
  if (!input) return null;
  return { action, input: { id: input.id, member_uid: input.memberUid, date: input.date, start_time: input.startTime, title: input.title, status: input.status } };
}
