import { apiRoutes } from "@contracts/api-routes";
import type { XActivityStatusDto } from "@contracts/x-activity";
import { apiFetch } from "@/shared/api/client";

export const xActivityQueryKey = ["member-posts", "x-activity"] as const;
export const fetchXActivity = () => apiFetch<XActivityStatusDto>(apiRoutes.xPosts.activity.build(), { auth: "required", cache: "no-store" });
export const startXActivity = (action: "start" | "resume" = "start") => apiFetch<XActivityStatusDto>(apiRoutes.xPosts.activity.build(), {
  auth: "required", method: "POST", json: { action, acknowledgeUncappedDelivery: true },
});
export const stopXActivity = () => apiFetch<XActivityStatusDto>(apiRoutes.xPosts.activity.build(), { auth: "required", method: "DELETE" });
