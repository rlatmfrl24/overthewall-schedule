import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { DDayItem, DDayPayload } from "../model/types";

export async function fetchDDays(options?: { noCache?: boolean; includeArchived?: boolean }) {
  const params = new URLSearchParams();
  if (options?.noCache) params.set("noCache", "1");
  if (options?.includeArchived) params.set("archive", "1");
  return apiFetch<DDayItem[]>(
    withRouteSearch(apiRoutes.ddays.collection.build(), params),
    options?.noCache ? { cache: "no-store" } : undefined,
  );
}

export async function createDDay(payload: DDayPayload) {
  return apiFetch(apiRoutes.ddays.collection.build(), {
    method: "POST",
    json: payload,
  });
}

export async function updateDDay(payload: DDayPayload & { id: number }) {
  return apiFetch(apiRoutes.ddays.collection.build(), {
    method: "PUT",
    json: payload,
  });
}

export async function deleteDDay(id: number) {
  return apiFetch(
    withRouteSearch(apiRoutes.ddays.collection.build(), `id=${id}`),
    { method: "DELETE" },
  );
}
