import { apiFetch } from "./client";
import type { DDayItem } from "../types";

export async function fetchDDays() {
  return apiFetch<DDayItem[]>("/api/ddays");
}
