import { apiRoutes } from "@contracts/api-routes";
import type { MultiviewChannelAddResponse, MultiviewChannelDeleteResponse, MultiviewChannelListResponse, MultiviewLiveStatusResponse } from "@contracts/multiview";
import { apiFetch } from "@/shared/api/client";
const options = (signal?: AbortSignal) => ({ auth: "required" as const, cache: "no-store" as const, signal });
export const fetchPersonalMultiviewChannels = (signal?: AbortSignal) => apiFetch<MultiviewChannelListResponse>(apiRoutes.multiview.channels.build(), options(signal));
export const addPersonalMultiviewChannel = (input: string, signal?: AbortSignal) => apiFetch<MultiviewChannelAddResponse>(apiRoutes.multiview.channels.build(), { ...options(signal), method: "POST", json: { input } });
export const deletePersonalMultiviewChannel = (channelId: string, signal?: AbortSignal) => apiFetch<MultiviewChannelDeleteResponse>(apiRoutes.multiview.channel.build(channelId), { ...options(signal), method: "DELETE" });
export const fetchPersonalMultiviewLiveStatus = (signal?: AbortSignal) => apiFetch<MultiviewLiveStatusResponse>(apiRoutes.multiview.liveStatus.build(), options(signal));
