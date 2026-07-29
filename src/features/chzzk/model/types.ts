import type {
  ChzzkClipDto,
  ChzzkClipsResponseDto,
  ChzzkVideoDto,
  ChzzkVideosResponseDto,
} from "@contracts/chzzk";

export type ChzzkVideo = ChzzkVideoDto & {
  memberUid?: number;
};

export type ChzzkClip = ChzzkClipDto & {
  memberUid?: number;
};

export type ChzzkVideosResponse = Omit<ChzzkVideosResponseDto, "data"> & {
  data: ChzzkVideo[];
};

export type ChzzkClipsResponse = Omit<ChzzkClipsResponseDto, "data"> & {
  data: ChzzkClip[];
};
