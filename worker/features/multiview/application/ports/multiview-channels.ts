import type { MultiviewChannelMetadata, SavedMultiviewChannel, MultiviewLiveStatusItemDto } from "@contracts/multiview";

export interface MultiviewChannelRepository {
  list(owner: string): Promise<SavedMultiviewChannel[]>;
  find(owner: string, channelId: string): Promise<SavedMultiviewChannel | null>;
  addWithLimit(owner: string, metadata: MultiviewChannelMetadata): Promise<SavedMultiviewChannel | null>;
  remove(owner: string, channelId: string): Promise<void>;
}
export interface MultiviewChannelReader {
  resolveChannel(channelId: string): Promise<MultiviewChannelMetadata | null>;
  readLiveStatuses(channelIds: readonly string[]): Promise<MultiviewLiveStatusItemDto[]>;
}
