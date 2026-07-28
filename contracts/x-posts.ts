export type XPostsVisibility = "public" | "members" | "private";

export interface XPostMediaDto {
  mediaKey: string;
  type: string;
  url: string | null;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface XLinkedPostPreviewDto {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  username: string;
  name: string | null;
  profileImageUrl: string | null;
  metrics: {
    likeCount: number;
    replyCount: number;
    repostCount: number;
    quoteCount: number;
  };
  media: XPostMediaDto[];
}

export interface XPostLinkDto {
  url: string;
  expandedUrl: string | null;
  displayUrl: string | null;
  resolvedUrl?: string | null;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  previewStatus?: "ready" | "unavailable" | "skipped";
  linkedPost?: XLinkedPostPreviewDto | null;
}

export interface XPostDto {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  username: string;
  metrics: {
    likeCount: number;
    replyCount: number;
    repostCount: number;
    quoteCount: number;
  };
  media: XPostMediaDto[];
  links?: XPostLinkDto[];
}

export interface XPostsByHandleDto {
  handle: string;
  userId: string | null;
  posts: XPostDto[];
  error: string | null;
  errorStatus?: number | null;
  errorDetail?: string | null;
  stale: boolean;
}

export interface XPostsResponseDto {
  posts: XPostDto[];
  updatedAt: string;
  clientStale?: boolean;
  byHandle: XPostsByHandleDto[];
}

export interface XPostsConfigResponseDto {
  visibility: XPostsVisibility;
}
