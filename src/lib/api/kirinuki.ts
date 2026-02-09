import { apiFetch } from "./client";
import type { KirinukiChannel } from "@/db/schema";
import type { YouTubeVideo } from "@/lib/types";

// ========== 채널 API ==========

export async function fetchKirinukiChannels(): Promise<KirinukiChannel[]> {
  return apiFetch<KirinukiChannel[]>("/api/kirinuki/channels");
}

export interface CreateKirinukiChannelPayload {
  channel_name: string;
  channel_url: string;
  youtube_channel_id: string;
}

export async function createKirinukiChannel(
  payload: CreateKirinukiChannelPayload,
): Promise<void> {
  await apiFetch("/api/kirinuki/channels", {
    method: "POST",
    json: payload,
  });
}

export interface UpdateKirinukiChannelPayload extends CreateKirinukiChannelPayload {
  id: number;
}

export async function updateKirinukiChannel(
  payload: UpdateKirinukiChannelPayload,
): Promise<void> {
  await apiFetch("/api/kirinuki/channels", {
    method: "PUT",
    json: payload,
  });
}

export async function deleteKirinukiChannel(id: number): Promise<void> {
  await apiFetch(`/api/kirinuki/channels?id=${id}`, { method: "DELETE" });
}

// ========== 영상 API ==========

export interface KirinukiVideosResponse {
  updatedAt: string;
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  byChannel: {
    channelId: string;
    channelName: string;
    content: {
      videos: YouTubeVideo[];
      shorts: YouTubeVideo[];
    } | null;
  }[];
}

export interface FetchKirinukiVideosOptions {
  maxResults?: number;
}

export async function fetchKirinukiVideos(
  options: FetchKirinukiVideosOptions = {},
): Promise<KirinukiVideosResponse> {
  const { maxResults = 20 } = options;
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  return apiFetch<KirinukiVideosResponse>(`/api/kirinuki/videos?${params}`);
}
