import type { DDayType } from "../../../../contracts/ddays";

export interface DDayWriteInput {
  title: string;
  date: string;
  description: string | null;
  color: string | null;
  type: DDayType;
}

export type DDayCommand = { action: "create"; input: DDayWriteInput }
  | { action: "update"; id: number; input: DDayWriteInput }
  | { action: "delete"; id: number };
export type DDayRequestIdentity = { actorId: string; requestId?: string };

/** The owning HTTP boundary supplies normalized values; replay cannot add fields. */
export function parseDDayCommand(value: unknown): DDayCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  if (command.action !== "create" && (!Number.isSafeInteger(command.id) || Number(command.id) <= 0)) return null;
  if (command.action === "delete") return { action: "delete", id: Number(command.id) };
  if (command.action !== "create" && command.action !== "update") return null;
  const input = command.input as Record<string, unknown> | null;
  if (!input || typeof input !== "object" || Array.isArray(input)
    || typeof input.title !== "string" || !input.title || input.title.trim() !== input.title
    || typeof input.date !== "string" || !input.date || input.date.trim() !== input.date
    || typeof input.type !== "string" || !input.type
    || ![input.description, input.color].every(value => value === null || typeof value === "string" && value.trim() === value)) return null;
  const normalized: DDayWriteInput = { title: input.title, date: input.date, description: input.description as string | null, color: input.color as string | null, type: input.type };
  return command.action === "create" ? { action: "create", input: normalized } : { action: "update", id: Number(command.id), input: normalized };
}
