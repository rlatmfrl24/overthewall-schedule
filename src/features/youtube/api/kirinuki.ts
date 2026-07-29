import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  CreateKirinukiChannelDto,
  KirinukiChannelDto,
  KirinukiVideosResponseDto,
  UpdateKirinukiChannelDto,
} from "@contracts/youtube";

// ========== 채널 API ==========

export async function fetchKirinukiChannels(): Promise<KirinukiChannelDto[]> {
  return apiFetch<KirinukiChannelDto[]>(
    apiRoutes.youtube.kirinukiChannels.build(),
  );
}

export async function createKirinukiChannel(
  payload: CreateKirinukiChannelDto,
): Promise<void> {
  await apiFetch(apiRoutes.youtube.kirinukiChannels.build(), {
    method: "POST",
    json: payload,
  });
}

export async function updateKirinukiChannel(
  payload: UpdateKirinukiChannelDto,
): Promise<void> {
  await apiFetch(apiRoutes.youtube.kirinukiChannels.build(), {
    method: "PUT",
    json: payload,
  });
}

export async function deleteKirinukiChannel(id: number): Promise<void> {
  await apiFetch(
    withRouteSearch(apiRoutes.youtube.kirinukiChannels.build(), `id=${id}`),
    { method: "DELETE" },
  );
}

// ========== 영상 API ==========

export type KirinukiVideosResponse = KirinukiVideosResponseDto;

export interface FetchKirinukiVideosOptions {
  maxResults?: number;
}

export async function fetchKirinukiVideos(
  options: FetchKirinukiVideosOptions = {},
): Promise<KirinukiVideosResponse> {
  const { maxResults = 20 } = options;
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  return apiFetch<KirinukiVideosResponse>(
    withRouteSearch(apiRoutes.youtube.kirinukiVideos.build(), params),
  );
}
