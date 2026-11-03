import { apiRoutes } from "@contracts/api-routes";
import type { XCollectionProvider, XCollectionStatusDto } from "@contracts/x-collection";
import { apiFetch } from "@/shared/api/client";

export const xCollectionQueryKey = ["member-posts", "x-collection"] as const;
export const fetchXCollectionStatus = () => apiFetch<XCollectionStatusDto>(apiRoutes.xPosts.collection.build(), { auth: "required", cache: "no-store" });
export const changeXCollectionSource = (primarySource: XCollectionProvider) => apiFetch<XCollectionStatusDto>(apiRoutes.xPosts.collection.build(), { auth: "required", method: "PATCH", json: { primarySource } });
