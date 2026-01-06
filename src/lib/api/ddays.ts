import { apiFetch } from "./client";
import type { DDayItem } from "../types";

export async function fetchDDays() {
  return apiFetch<DDayItem[]>("/api/ddays");
}

export type DDayPayload = {
  id?: number;
  title: string;
  date: string;
  description?: string | null;
  color?: string | null;
  type: DDayItem["type"];
};

export async function createDDay(payload: DDayPayload) {
  return apiFetch("/api/ddays", { method: "POST", json: payload });
}

export async function updateDDay(payload: DDayPayload & { id: number }) {
  return apiFetch("/api/ddays", { method: "PUT", json: payload });
}

export async function deleteDDay(id: number) {
  return apiFetch(`/api/ddays?id=${id}`, { method: "DELETE" });
}
