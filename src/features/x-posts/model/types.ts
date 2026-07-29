import type {
  XPostDto,
  XPostsByHandleDto,
  XPostsResponseDto,
} from "@contracts/x-posts";

export type XPostViewModel = XPostDto & {
  memberUid?: number;
};

export type XPostsByHandleViewModel = Omit<XPostsByHandleDto, "posts"> & {
  posts: XPostViewModel[];
};

export type XPostsViewModelResponse = Omit<
  XPostsResponseDto,
  "posts" | "byHandle"
> & {
  posts: XPostViewModel[];
  byHandle: XPostsByHandleViewModel[];
};
