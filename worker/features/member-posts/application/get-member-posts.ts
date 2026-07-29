import type { XPostDto } from "@contracts/x-posts";
import type {
  MemberPostsConfigs,
  MemberPostsPort,
  Visibility,
} from "./ports";

type SourcePolicyStatus =
  | "visible"
  | "members_only"
  | "private"
  | "disabled"
  | "not_requested";
type SourcePolicy = {
  source: "x" | "naver-cafe";
  requested: boolean;
  admin: boolean;
  enabled: boolean;
  visibility: Visibility;
  accessible: boolean;
  status: SourcePolicyStatus;
  reason: string | null;
  publicPath: string;
  monitorPath: string;
  apiPath: string;
};

const PUBLIC_PATH = "/feed";
const MONITOR_PATH = "/admin/member-posts";
const PUBLIC_CACHE =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=1800";
const PRIVATE_CACHE = "no-store";

const createXPolicy = (
  requested: boolean,
  admin: boolean,
  visibility: Visibility,
): SourcePolicy => ({
  source: "x",
  requested,
  admin,
  enabled: true,
  visibility,
  accessible: requested && (admin || visibility !== "private"),
  status: !requested
    ? "not_requested"
    : visibility === "private"
      ? "private"
      : visibility === "members"
        ? "members_only"
        : "visible",
  reason: !requested
    ? "X posts were not requested."
    : visibility === "private"
      ? admin
        ? "X posts are hidden from the public feed but visible in admin monitoring."
        : "X posts are private."
      : visibility === "members"
        ? "X posts require member authentication."
        : null,
  publicPath: PUBLIC_PATH,
  monitorPath: MONITOR_PATH,
  apiPath: "/api/member-posts?sources=x&admin=1",
});

const createNaverCafePolicy = (
  requested: boolean,
  admin: boolean,
  enabled: boolean,
  visibility: Visibility,
): SourcePolicy => ({
  source: "naver-cafe",
  requested,
  admin,
  enabled,
  visibility,
  accessible: requested && (admin || (enabled && visibility !== "private")),
  status: !requested
    ? "not_requested"
    : !enabled
      ? "disabled"
      : visibility === "private"
        ? "private"
        : visibility === "members"
          ? "members_only"
          : "visible",
  reason: !requested
    ? "Naver Cafe posts were not requested."
    : !enabled
      ? admin
        ? "Naver Cafe feed display is disabled, but admin monitoring can inspect it."
        : "Naver Cafe posts are disabled."
      : visibility === "private"
        ? admin
          ? "Naver Cafe posts are hidden from the public feed but visible in admin monitoring."
          : "Naver Cafe posts are private."
        : visibility === "members"
          ? "Naver Cafe posts require member authentication."
          : null,
  publicPath: PUBLIC_PATH,
  monitorPath: MONITOR_PATH,
  apiPath: "/api/member-posts?sources=naver-cafe&admin=1",
});

const emptyX = (policy: SourcePolicy, error: string | null = null) => ({
  updatedAt: new Date().toISOString(),
  posts: [] as Array<XPostDto & { memberUid?: number }>,
  byHandle: [],
  error,
  policy,
});

const emptyNaverCafe = (
  policy: SourcePolicy,
  error: string | null = null,
) => ({
  updatedAt: new Date().toISOString(),
  posts: [] as Array<{
    id: string;
    createdAt: string;
    memberUid: number | null;
    [key: string]: unknown;
  }>,
  sources: [] as unknown[],
  error,
  policy,
});

const getCacheControl = (
  adminView: boolean,
  includeX: boolean,
  includeNaverCafe: boolean,
  configs: MemberPostsConfigs,
) => {
  if (adminView) return PRIVATE_CACHE;
  if (includeX && configs.x.visibility !== "public") return PRIVATE_CACHE;
  if (
    includeNaverCafe &&
    (!configs.naverCafe.enabled || configs.naverCafe.visibility !== "public")
  ) {
    return PRIVATE_CACHE;
  }
  return PUBLIC_CACHE;
};

export class GetMemberPosts {
  private readonly port: MemberPostsPort;

  constructor(port: MemberPostsPort) {
    this.port = port;
  }

  readConfigs() {
    return this.port.readConfigs();
  }

  async execute(input: {
    includeX: boolean;
    includeNaverCafe: boolean;
    adminView: boolean;
    compact: boolean;
    maxResults: number;
    size: number;
    configs: MemberPostsConfigs;
  }) {
    const {
      includeX,
      includeNaverCafe,
      adminView,
      compact,
      maxResults,
      size,
      configs,
    } = input;
    const xPolicy = createXPolicy(
      includeX,
      adminView,
      configs.x.visibility,
    );
    const cafePolicy = createNaverCafePolicy(
      includeNaverCafe,
      adminView,
      configs.naverCafe.enabled,
      configs.naverCafe.visibility,
    );
    const [memberRows, cafeSources] = await Promise.all([
      includeX && xPolicy.accessible
        ? this.port.listActiveMembers()
        : Promise.resolve([]),
      includeNaverCafe && cafePolicy.accessible
        ? this.port.listNaverCafeSources()
        : Promise.resolve([]),
    ]);
    const handlePairs = memberRows
      .map((member) => {
        const handle = this.port.extractXHandle(member.url_twitter);
        return handle ? { handle, memberUid: member.uid } : null;
      })
      .filter((item): item is { handle: string; memberUid: number } =>
        Boolean(item),
      );
    const handleToMemberUid = new Map(
      handlePairs.map((item) => [item.handle.toLowerCase(), item.memberUid]),
    );
    const handles = Array.from(new Set(handlePairs.map((item) => item.handle)));
    const mapPost = (post: XPostDto) => ({
      ...post,
      memberUid: handleToMemberUid.get(post.username.toLowerCase()),
    });

    const [x, naverCafe] = await Promise.all([
      (async () => {
        if (!includeX) return emptyX(xPolicy);
        if (configs.x.visibility === "private" && !adminView) {
          return emptyX(xPolicy, "X posts are private");
        }
        if (handles.length === 0) return emptyX(xPolicy);
        try {
          const content = await this.port.fetchXPosts(handles, {
            maxResults,
            richXLinkPreviewEnabled: configs.x.richLinkPreviewEnabled,
            adminView,
          });
          return {
            updatedAt: new Date().toISOString(),
            posts: content.posts.map(mapPost),
            byHandle: content.byHandle.map((item) => ({
              ...item,
              posts: item.posts.map(mapPost),
            })),
            error: null,
            policy: xPolicy,
          };
        } catch (error) {
          if (!this.port.isXApiError(error)) {
            console.error("Failed to aggregate X posts", error);
          }
          return emptyX(
            xPolicy,
            this.port.isXApiError(error)
              ? error instanceof Error
                ? error.message
                : String(error)
              : "Failed to fetch X posts",
          );
        }
      })(),
      (async () => {
        if (!includeNaverCafe) return emptyNaverCafe(cafePolicy);
        if (!configs.naverCafe.enabled && !adminView) {
          return emptyNaverCafe(cafePolicy, "Naver Cafe posts are disabled");
        }
        if (configs.naverCafe.visibility === "private" && !adminView) {
          return emptyNaverCafe(cafePolicy, "Naver Cafe posts are private");
        }
        if (cafeSources.length === 0) return emptyNaverCafe(cafePolicy);
        try {
          const content = await this.port.readNaverCafePosts(cafeSources, size);
          return {
            updatedAt: new Date().toISOString(),
            ...content,
            error: null,
            policy: cafePolicy,
          };
        } catch (error) {
          console.error("Failed to aggregate Naver Cafe posts", error);
          return emptyNaverCafe(cafePolicy, "Failed to fetch Naver Cafe posts");
        }
      })(),
    ]);

    const posts = [
      ...x.posts.map((post) => ({
        kind: "x" as const,
        id: `x:${post.id}`,
        createdAt: post.createdAt,
        memberUid: post.memberUid ?? null,
        post,
      })),
      ...naverCafe.posts.map((post) => ({
        kind: "cafe" as const,
        id: `cafe:${post.id}`,
        createdAt: post.createdAt,
        memberUid: post.memberUid,
        post,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      body: {
        updatedAt: new Date().toISOString(),
        posts,
        x: compact
          ? {
              ...x,
              posts: [],
              byHandle: x.byHandle.map((item) => ({ ...item, posts: [] })),
            }
          : x,
        naverCafe: compact ? { ...naverCafe, posts: [] } : naverCafe,
      },
      cacheControl: getCacheControl(
        adminView,
        includeX,
        includeNaverCafe,
        configs,
      ),
    };
  }
}
